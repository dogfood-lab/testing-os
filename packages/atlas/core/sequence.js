import { posix } from 'node:path';

/**
 * The order of work inside a file: for each function, the calls it makes into
 * other tracked files, in the order the source makes them.
 *
 * Reading happens in two passes because a call's target is only known once
 * imports are resolved, and the tree is gone by then. The first pass, while
 * the tree is alive, records each call as the binding it goes through (an
 * import site, a function in the same file, or a parameter). The second pass,
 * after resolution, turns bindings into targets, splices same-file callees in
 * place, and picks the file's entry function.
 */

const MAX_CALLS = 24;
const MAX_INNER = 12;
const MAX_ALIAS_DEPTH = 8;
const ENTRY_NAMES = ['main', 'run', 'cli'];

const JS_FUNCTIONS = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'function',
  'generator_function',
  'arrow_function',
  'method_definition',
]);
const JS_STATEMENT_LISTS = new Set(['program', 'statement_block', 'class_static_block', 'switch_case', 'switch_default']);
const JS_WRAPPERS = new Set(['parenthesized_expression', 'await_expression', 'as_expression', 'satisfies_expression', 'non_null_expression']);
const PY_FUNCTIONS = new Set(['function_definition', 'lambda']);

// A method with a built-in collection, string, promise or logger name on a
// receiver the engine cannot follow is almost always that built-in:
// scenarios.get() is a Map lookup and logger.warn() a log line, not work in
// another file. Only receivers with no known target are filtered; a namespace
// import's get() still names its file.
const BUILTIN_METHODS = new Set([
  'debug', 'error', 'info', 'log', 'trace', 'warn',
  'add', 'apply', 'at', 'bind', 'call', 'catch', 'clear', 'concat', 'delete', 'endsWith', 'entries', 'every',
  'fill', 'filter', 'finally', 'find', 'findIndex', 'flat', 'flatMap', 'forEach', 'get', 'getTime', 'has',
  'hasOwnProperty', 'includes', 'indexOf', 'join', 'keys', 'lastIndexOf', 'map', 'match', 'matchAll', 'padEnd',
  'padStart', 'pop', 'push', 'reduce', 'replace', 'replaceAll', 'reverse', 'set', 'shift', 'slice', 'some',
  'sort', 'splice', 'split', 'startsWith', 'test', 'then', 'toISOString', 'toLowerCase', 'toString',
  'toUpperCase', 'trim', 'trimEnd', 'trimStart', 'unshift', 'values',
  // Python
  'append', 'close', 'copy', 'decode', 'discard', 'encode', 'endswith', 'extend', 'format', 'insert', 'items',
  'lower', 'read', 'remove', 'setdefault', 'startswith', 'strip', 'update', 'upper', 'write',
]);

/**
 * The first pass: every function in the file with the calls its body makes,
 * each still a binding, and which module-level functions the file's top-level
 * code invokes. Plain data, so it outlives the tree.
 *
 * @param {'javascript'|'typescript'|'tsx'|'python'} language
 * @param {object} root tree-sitter root node
 */
export function sequenceFacts(language, root) {
  const python = language === 'python';
  const ctx = python ? pythonContext(root) : scriptContext(root);
  const functions = new Map();
  const queue = [];
  const enqueue = (node, name, moduleLevel) => {
    if (functions.has(node.startIndex)) return;
    const record = { id: node.startIndex, name, line: node.startPosition.row + 1, moduleLevel, steps: null, node };
    functions.set(record.id, record);
    queue.push(record);
  };
  for (const { node, name } of ctx.moduleFunctions) enqueue(node, name, true);

  const collect = (body) => {
    const steps = [];
    (python ? visitPy : visitJs)(body, ctx, steps);
    for (const step of steps) {
      if (step.kind === 'local') enqueue(step.node, step.name, false);
    }
    return steps;
  };

  const topLevel = [];
  for (const step of collect(root)) {
    if (step.kind === 'local' && ctx.moduleIds.has(step.node.startIndex) && !topLevel.includes(step.node.startIndex)) {
      topLevel.push(step.node.startIndex);
    }
  }
  while (queue.length > 0) {
    const record = queue.shift();
    record.steps = collect(record.node.childForFieldName('body'));
  }

  const plain = (step) => {
    if (step.kind === 'local') return { kind: 'local', fn: step.node.startIndex, line: step.line };
    const out = { kind: step.kind, name: step.name, line: step.line };
    if (step.site) out.site = step.site;
    if (step.passed) out.passed = true;
    return out;
  };
  return {
    functions: [...functions.values()]
      .sort((a, b) => a.id - b.id)
      .map((record) => ({
        id: record.id,
        name: record.name,
        line: record.line,
        moduleLevel: record.moduleLevel,
        exported: ctx.exported.has(record.id),
        isDefaultExport: ctx.defaultExport === record.id,
        steps: record.steps.map(plain),
      })),
    topLevel,
  };
}

/**
 * The second pass. Records `sequences`, `entry` and `entryRule` on every file
 * a door runs and on every file such a file calls into, and attaches `inner`
 * to the entry calls of the files a door runs.
 *
 * @param {{ files: Map<string, object>, facts: Map<string, object>, doors: object[], entryPoints: Map<string, string[]> }} input
 */
export function attachSequences({ files, facts, doors, entryPoints }) {
  const seeds = new Set();
  for (const door of doors) {
    if (door.parseError) continue;
    for (const run of door.runs) if (facts.has(run.path)) seeds.add(run.path);
  }
  const built = new Map();
  const build = (path) => {
    if (!built.has(path)) built.set(path, fileSequences(path, files.get(path), facts.get(path), files));
    return built.get(path);
  };
  const hops = new Set();
  for (const path of [...seeds].sort()) {
    for (const sequence of build(path).sequences) {
      for (const call of sequence.calls) {
        for (const hop of targetFiles(call.target, entryPoints)) if (facts.has(hop)) hops.add(hop);
      }
    }
  }
  for (const path of [...hops].sort()) build(path);

  for (const path of [...seeds].sort()) {
    const { sequences, entry } = built.get(path);
    const root = sequences.find((sequence) => sequence.name === entry);
    if (!root) continue;
    for (const call of root.calls) {
      if (call.passed || call.target == null) continue;
      const callee = targetFiles(call.target, entryPoints)
        .map((hop) => built.get(hop)?.sequences.find((sequence) => sequence.name === call.name))
        .find(Boolean);
      if (!callee) continue;
      call.inner = callee.calls.slice(0, MAX_INNER).map(({ inner, innerTruncated, ...rest }) => rest);
      if (callee.calls.length > MAX_INNER || callee.truncated) call.innerTruncated = true;
    }
  }

  for (const [path, result] of [...built.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (result.sequences.length === 0 && result.entry == null) continue;
    const file = files.get(path);
    file.sequences = result.sequences;
    if (result.entry != null) {
      file.entry = result.entry;
      file.entryRule = result.entryRule;
    }
  }
}

function targetFiles(target, entryPoints) {
  if (target?.file) return [target.file];
  if (target?.boundary) return entryPoints.get(target.boundary) ?? [];
  return [];
}

function fileSequences(path, file, facts, files) {
  const byId = new Map(facts.functions.map((fn) => [fn.id, fn]));
  const sites = Array.isArray(file.imports) ? file.imports : [];
  const targetOf = (site) => {
    const hit = sites.find((entry) => entry.specifier === site.specifier && entry.line === site.line);
    const resolved = hit?.resolved;
    if (resolved?.outcome === 'file' && files.has(resolved.path)) return { file: resolved.path };
    if (resolved?.outcome === 'boundary') return { boundary: resolved.boundary };
    return undefined;
  };

  const spliced = (fn) => {
    const calls = [];
    const visited = new Set([fn.id]);
    const expand = (current, via) => {
      for (const step of current.steps) {
        if (step.kind === 'local') {
          // A function is spliced at its first call only. Each later call adds
          // nothing, so a helper called at every stage is read once, and a
          // function that calls itself cannot loop.
          if (visited.has(step.fn) || !byId.has(step.fn)) continue;
          visited.add(step.fn);
          const callee = byId.get(step.fn);
          expand(callee, callee.name);
          continue;
        }
        const target = step.kind === 'unknown' ? null : targetOf(step.site);
        if (target === undefined) continue;
        const call = { name: step.name, target, line: step.line };
        if (step.passed) call.passed = true;
        if (via != null) call.via = via;
        const last = calls[calls.length - 1];
        if (last && last.name === call.name && sameTarget(last.target, call.target) && last.passed === call.passed) continue;
        calls.push(call);
      }
    };
    expand(fn, null);
    return calls;
  };

  const sequences = [];
  const size = new Map();
  for (const fn of facts.functions) {
    if (!fn.moduleLevel) continue;
    const calls = spliced(fn);
    size.set(fn.id, calls.length);
    if (calls.length === 0) continue;
    const sequence = {
      name: fn.name,
      exported: fn.exported,
      invokedAtTopLevel: facts.topLevel.includes(fn.id),
      isDefaultExport: fn.isDefaultExport,
      calls: calls.slice(0, MAX_CALLS),
    };
    if (calls.length > MAX_CALLS) sequence.truncated = true;
    sequences.push(sequence);
  }
  const chosen = entryOf(path, facts, size);
  return { sequences, entry: chosen?.name ?? null, entryRule: chosen?.rule ?? null };
}

function sameTarget(a, b) {
  if (a == null || b == null) return a == null && b == null;
  return a.file === b.file && a.boundary === b.boundary;
}

// The widest candidate wins, and source order breaks a tie: the one that
// reaches the most work is the one a reader should follow.
function widest(candidates, size) {
  let best = null;
  for (const fn of candidates) if (best == null || size.get(fn.id) > size.get(best.id)) best = fn;
  return best;
}

function entryOf(path, facts, size) {
  const moduleLevel = facts.functions.filter((fn) => fn.moduleLevel);
  const invoked = moduleLevel.filter((fn) => facts.topLevel.includes(fn.id));
  if (invoked.length > 0) return { name: widest(invoked, size).name, rule: 1 };
  const byDefault = moduleLevel.find((fn) => fn.isDefaultExport);
  if (byDefault) return { name: byDefault.name, rule: 2 };
  const exported = moduleLevel.filter((fn) => fn.exported);
  const base = posix.basename(path).replace(/\..*$/, '');
  const named = exported.find((fn) => ENTRY_NAMES.includes(fn.name) || fn.name === base);
  if (named) return { name: named.name, rule: 3 };
  const reaching = exported.filter((fn) => size.get(fn.id) > 0);
  if (reaching.length > 0) return { name: widest(reaching, size).name, rule: 4 };
  return null;
}

// ---------------------------------------------------------------------------
// JavaScript and TypeScript

function scriptContext(root) {
  const moduleFunctions = [];
  const exported = new Set();
  const exportedNames = new Set();
  let defaultExport = null;
  let defaultName = null;
  const add = (node, name) => moduleFunctions.push({ node, name });

  for (const statement of root.namedChildren) {
    let declaration = statement;
    let isDefault = false;
    if (statement.type === 'export_statement') {
      isDefault = statement.children.some((child) => child.type === 'default');
      declaration = statement.childForFieldName('declaration');
      const value = statement.childForFieldName('value');
      if (isDefault && value) {
        if (value.type === 'identifier') defaultName = value.text;
        else if (JS_FUNCTIONS.has(value.type)) {
          add(value, value.childForFieldName('name')?.text ?? 'default');
          defaultExport = value.startIndex;
          exported.add(value.startIndex);
        }
      }
      for (const clause of statement.namedChildren.filter((child) => child.type === 'export_clause')) {
        for (const specifier of clause.namedChildren) {
          const name = specifier.childForFieldName('name')?.text;
          if (!name) continue;
          exportedNames.add(name);
          if (specifier.childForFieldName('alias')?.text === 'default') defaultName = name;
        }
      }
      if (!declaration) continue;
    }
    if (declaration.type === 'function_declaration' || declaration.type === 'generator_function_declaration') {
      add(declaration, declaration.childForFieldName('name')?.text ?? 'default');
      if (statement !== declaration) exported.add(declaration.startIndex);
      if (isDefault) defaultExport = declaration.startIndex;
    } else if (declaration.type === 'lexical_declaration' || declaration.type === 'variable_declaration') {
      for (const declarator of declaration.namedChildren) {
        if (declarator.type !== 'variable_declarator') continue;
        const value = unwrap(declarator.childForFieldName('value'));
        const name = declarator.childForFieldName('name');
        if (!value || name?.type !== 'identifier' || !JS_FUNCTIONS.has(value.type)) continue;
        add(value, name.text);
        if (statement !== declaration) exported.add(value.startIndex);
      }
    } else if (declaration.type === 'expression_statement') {
      for (const name of commonJsExports(declaration.namedChildren[0])) exportedNames.add(name);
    }
  }
  for (const { node, name } of moduleFunctions) {
    if (exportedNames.has(name)) exported.add(node.startIndex);
    if (defaultName != null && name === defaultName) {
      defaultExport = node.startIndex;
      exported.add(node.startIndex);
    }
  }
  return {
    root,
    moduleFunctions,
    moduleIds: new Set(moduleFunctions.map(({ node }) => node.startIndex)),
    exported,
    defaultExport,
  };
}

// module.exports = { a, b: c }, module.exports.a = a and exports.a = a name
// the functions they hand out by their local names.
function commonJsExports(expression) {
  if (expression?.type !== 'assignment_expression') return [];
  const left = expression.childForFieldName('left');
  const right = expression.childForFieldName('right');
  const leftText = left?.text ?? '';
  if (leftText === 'module.exports' && right?.type === 'object') {
    const names = [];
    for (const entry of right.namedChildren) {
      if (entry.type === 'shorthand_property_identifier') names.push(entry.text);
      else if (entry.type === 'pair' && entry.childForFieldName('value')?.type === 'identifier') names.push(entry.childForFieldName('value').text);
    }
    return names;
  }
  if (/^(module\.)?exports\.[A-Za-z_$][\w$]*$/.test(leftText) && right?.type === 'identifier') return [right.text];
  return [];
}

function unwrap(node) {
  let current = node;
  while (current && JS_WRAPPERS.has(current.type)) current = current.namedChildren[0];
  return current ?? null;
}

// A tagged template's substitutions are eager arguments like any other.
function argumentNodes(call) {
  const args = call.childForFieldName('arguments');
  if (!args) return [];
  if (args.type === 'template_string') return [args];
  return args.namedChildren.filter((child) => child.type !== 'comment');
}

/**
 * Calls in the order they run. A call's eager arguments run before it; an
 * inline function handed to it runs inside it, so its calls follow the call
 * itself, at the position of the statement that holds them. A function
 * defined here but not handed to anything does not run here.
 */
function visitJs(node, ctx, steps) {
  if (!node) return;
  if (JS_FUNCTIONS.has(node.type) || node.type === 'class_declaration' || node.type === 'class') return;
  if (node.type === 'call_expression' || node.type === 'new_expression') {
    const fn = node.childForFieldName(node.type === 'call_expression' ? 'function' : 'constructor');
    const args = argumentNodes(node);
    if (fn && fn.type !== 'identifier') visitJs(fn, ctx, steps);
    for (const arg of args) if (!JS_FUNCTIONS.has(arg.type)) visitJs(arg, ctx, steps);
    if (node.type === 'call_expression') {
      const step = classifyJs(node, fn, ctx);
      if (step) steps.push(step);
    }
    for (const arg of args) {
      if (JS_FUNCTIONS.has(arg.type)) {
        const body = arg.childForFieldName('body');
        if (body && JS_FUNCTIONS.has(body.type)) continue;
        visitJs(body, ctx, steps);
      } else if (arg.type === 'identifier') {
        const binding = resolveJs(arg.text, arg, ctx, 0);
        if (binding?.kind === 'import') steps.push({ kind: 'import', name: binding.imported ?? arg.text, site: binding.site, line: lineOf(arg), passed: true });
      }
    }
    return;
  }
  for (const child of node.namedChildren) visitJs(child, ctx, steps);
}

function classifyJs(call, fn, ctx) {
  if (!fn) return null;
  const line = lineOf(call);
  if (fn.type === 'identifier') {
    if (fn.text === 'require') return null;
    const binding = resolveJs(fn.text, fn, ctx, 0);
    if (binding?.kind === 'import') return { kind: 'import', name: binding.imported ?? fn.text, site: binding.site, line };
    if (binding?.kind === 'local') return { kind: 'local', node: binding.node, name: binding.name ?? fn.text, line };
    return null;
  }
  if (fn.type !== 'member_expression') return null;
  const object = unwrap(fn.childForFieldName('object'));
  const property = fn.childForFieldName('property');
  if (object?.type !== 'identifier' || property?.type !== 'property_identifier') return null;
  const binding = resolveJs(object.text, object, ctx, 0);
  if (binding?.kind === 'import') return { kind: 'import', name: property.text, site: binding.site, line };
  if (binding?.kind === 'param' && !BUILTIN_METHODS.has(property.text)) return { kind: 'unknown', name: property.text, line };
  return null;
}

/**
 * What a name is bound to at a point in the file: an import site (with the
 * name it is imported under, or null for a namespace or default), a function
 * in this file, or a parameter of the function being read. A parameter of an
 * inline callback is none of these: nothing says what the caller passes it.
 */
function resolveJs(name, from, ctx, depth) {
  if (depth > MAX_ALIAS_DEPTH) return null;
  for (let scope = from.parent; scope; scope = scope.parent) {
    if (JS_FUNCTIONS.has(scope.type)) {
      if (declaresParameter(scope, name)) return isInlineArgument(scope) ? null : { kind: 'param' };
      continue;
    }
    if (scope.type === 'catch_clause' && scope.childForFieldName('parameter')?.text === name) return null;
    if ((scope.type === 'for_in_statement' || scope.type === 'for_of_statement') && patternNames(scope.childForFieldName('left')).has(name)) return null;
    let found = null;
    if (scope.type === 'for_statement') found = declarationIn([scope.childForFieldName('initializer')], name, ctx, depth);
    else if (JS_STATEMENT_LISTS.has(scope.type)) found = declarationIn(scope.namedChildren, name, ctx, depth);
    if (found) return found.kind === 'other' ? null : found;
  }
  return null;
}

function declarationIn(statements, name, ctx, depth) {
  for (const statement of statements) {
    if (!statement) continue;
    if (statement.type === 'import_statement') {
      const found = importBinding(statement, name);
      if (found) return found;
      continue;
    }
    const declaration = statement.type === 'export_statement' ? statement.childForFieldName('declaration') : statement;
    if (!declaration) continue;
    if ((declaration.type === 'function_declaration' || declaration.type === 'generator_function_declaration')
      && declaration.childForFieldName('name')?.text === name) {
      return { kind: 'local', node: declaration, name };
    }
    if (declaration.type === 'class_declaration' && declaration.childForFieldName('name')?.text === name) return { kind: 'other' };
    if (declaration.type !== 'lexical_declaration' && declaration.type !== 'variable_declaration') continue;
    for (const declarator of declaration.namedChildren) {
      if (declarator.type !== 'variable_declarator') continue;
      const id = declarator.childForFieldName('name');
      const value = declarator.childForFieldName('value');
      if (id?.type === 'identifier' && id.text === name) return valueOf(value, name, ctx, depth + 1) ?? { kind: 'other' };
      if (id?.type === 'object_pattern' || id?.type === 'array_pattern') {
        const key = patternKey(id, name);
        if (key === undefined) continue;
        return destructured(value, key, ctx, depth + 1) ?? { kind: 'other' };
      }
    }
  }
  return null;
}

function importBinding(statement, name) {
  const source = statement.childForFieldName('source');
  const specifier = stringText(source);
  if (specifier == null) return null;
  const site = { specifier, line: lineOf(statement) };
  const clause = statement.namedChildren.find((child) => child.type === 'import_clause');
  if (!clause) return null;
  for (const part of clause.namedChildren) {
    if (part.type === 'identifier' && part.text === name) return { kind: 'import', site, imported: null };
    if (part.type === 'namespace_import' && part.namedChildren[0]?.text === name) return { kind: 'import', site, imported: null, namespace: true };
    if (part.type !== 'named_imports') continue;
    for (const specifierNode of part.namedChildren) {
      const imported = specifierNode.childForFieldName('name')?.text;
      const local = specifierNode.childForFieldName('alias')?.text ?? imported;
      if (local === name) return { kind: 'import', site, imported };
    }
  }
  return null;
}

// An alias is followed to what it stands for: validate = overrides.validate
// || defaultValidate is the imported function when nothing overrides it.
function valueOf(value, name, ctx, depth) {
  const node = unwrap(value);
  if (!node || depth > MAX_ALIAS_DEPTH) return null;
  if (JS_FUNCTIONS.has(node.type)) return { kind: 'local', node, name };
  if (node.type === 'identifier') return resolveJs(node.text, node, ctx, depth + 1);
  if (node.type === 'binary_expression') {
    const operator = node.childForFieldName('operator')?.text;
    if (operator !== '||' && operator !== '??') return null;
    return preferred([node.childForFieldName('left'), node.childForFieldName('right')].map((side) => valueOf(side, name, ctx, depth + 1)));
  }
  if (node.type === 'ternary_expression') {
    return preferred([node.childForFieldName('consequence'), node.childForFieldName('alternative')].map((side) => valueOf(side, name, ctx, depth + 1)));
  }
  if (node.type === 'member_expression') {
    const object = unwrap(node.childForFieldName('object'));
    const property = node.childForFieldName('property');
    let root = object;
    while (root?.type === 'member_expression') root = unwrap(root.childForFieldName('object'));
    if (root?.type !== 'identifier') return null;
    const base = resolveJs(root.text, root, ctx, depth + 1);
    if (base?.kind === 'import' && root === object && property?.type === 'property_identifier') {
      return { kind: 'import', site: base.site, imported: property.text };
    }
    return base?.kind === 'param' ? { kind: 'param' } : null;
  }
  if (node.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    if (fn?.type !== 'import' && !(fn?.type === 'identifier' && fn.text === 'require')) return null;
    const specifier = stringText(argumentNodes(node)[0]);
    if (specifier == null) return null;
    return { kind: 'import', site: { specifier, line: lineOf(node) }, imported: null, namespace: true };
  }
  return null;
}

function preferred(candidates) {
  return candidates.find((candidate) => candidate?.kind === 'import' || candidate?.kind === 'local')
    ?? candidates.find((candidate) => candidate?.kind === 'param')
    ?? null;
}

function destructured(value, key, ctx, depth) {
  const base = valueOf(value, null, ctx, depth);
  if (base?.kind === 'import' && base.namespace && key != null) return { kind: 'import', site: base.site, imported: key };
  if (base?.kind === 'param') return { kind: 'param' };
  return null;
}

// The property a destructuring pattern reads into name: { a } reads a,
// { a: b } reads a into b. undefined when the pattern does not bind name; null
// when it binds it from a position rather than a property.
function patternKey(pattern, name) {
  for (const entry of pattern.namedChildren) {
    if (entry.type === 'shorthand_property_identifier_pattern' && entry.text === name) return name;
    if (entry.type === 'object_assignment_pattern' && entry.childForFieldName('left')?.text === name) return name;
    if (entry.type === 'pair_pattern') {
      const value = entry.childForFieldName('value');
      const target = value?.type === 'assignment_pattern' ? value.childForFieldName('left') : value;
      if (target?.type === 'identifier' && target.text === name) return entry.childForFieldName('key')?.text ?? null;
    }
    if (pattern.type === 'array_pattern' && patternNames(entry).has(name)) return null;
    if (entry.type === 'rest_pattern' && patternNames(entry).has(name)) return null;
  }
  return undefined;
}

function patternNames(node) {
  const names = new Set();
  const visit = (current) => {
    if (!current) return;
    if (current.type === 'identifier' || current.type === 'shorthand_property_identifier_pattern') {
      names.add(current.text);
      return;
    }
    if (current.type === 'pair_pattern') return visit(current.childForFieldName('value'));
    if (current.type === 'assignment_pattern' || current.type === 'object_assignment_pattern') return visit(current.childForFieldName('left'));
    for (const child of current.namedChildren) visit(child);
  };
  visit(node);
  return names;
}

function declaresParameter(fn, name) {
  const single = fn.childForFieldName('parameter');
  if (single) return single.text === name;
  const params = fn.childForFieldName('parameters');
  if (!params) return false;
  for (const param of params.namedChildren) {
    const pattern = param.type === 'required_parameter' || param.type === 'optional_parameter' ? param.childForFieldName('pattern') : param;
    if (patternNames(pattern).has(name)) return true;
  }
  return false;
}

function isInlineArgument(fn) {
  return fn.parent?.type === 'arguments' || fn.parent?.type === 'argument_list';
}

function stringText(node) {
  if (!node || node.type !== 'string') return null;
  return node.namedChildren.filter((child) => child.type === 'string_fragment').map((child) => child.text).join('');
}

// ---------------------------------------------------------------------------
// Python

function pythonContext(root) {
  const moduleFunctions = [];
  for (const statement of root.namedChildren) {
    const definition = statement.type === 'decorated_definition' ? statement.childForFieldName('definition') : statement;
    if (definition?.type !== 'function_definition') continue;
    moduleFunctions.push({ node: definition, name: definition.childForFieldName('name')?.text ?? '' });
  }
  // Python has no export statement; a module-level name without a leading
  // underscore is the module's public surface.
  const exported = new Set(moduleFunctions.filter(({ name }) => !name.startsWith('_')).map(({ node }) => node.startIndex));
  return {
    root,
    moduleFunctions,
    moduleIds: new Set(moduleFunctions.map(({ node }) => node.startIndex)),
    exported,
    defaultExport: null,
  };
}

function visitPy(node, ctx, steps) {
  if (!node) return;
  if (PY_FUNCTIONS.has(node.type) || node.type === 'class_definition' || node.type === 'decorated_definition') return;
  if (node.type === 'call') {
    const fn = node.childForFieldName('function');
    const args = pythonArguments(node);
    if (fn && fn.type !== 'identifier') visitPy(fn, ctx, steps);
    for (const arg of args) if (arg.type !== 'lambda') visitPy(arg, ctx, steps);
    const step = classifyPy(node, fn, ctx);
    if (step) steps.push(step);
    for (const arg of args) {
      if (arg.type === 'lambda') visitPy(arg.childForFieldName('body'), ctx, steps);
      else if (arg.type === 'identifier') {
        const binding = resolvePy(arg.text, arg, ctx);
        if (binding?.kind === 'import') steps.push({ kind: 'import', name: binding.imported ?? arg.text, site: binding.site, line: lineOf(arg), passed: true });
      }
    }
    return;
  }
  for (const child of node.namedChildren) visitPy(child, ctx, steps);
}

function pythonArguments(call) {
  const args = call.childForFieldName('arguments');
  if (!args) return [];
  return args.namedChildren
    .filter((child) => child.type !== 'comment')
    .map((child) => (child.type === 'keyword_argument' ? child.childForFieldName('value') : child))
    .filter(Boolean);
}

function classifyPy(call, fn, ctx) {
  if (!fn) return null;
  const line = lineOf(call);
  if (fn.type === 'identifier') {
    const binding = resolvePy(fn.text, fn, ctx);
    if (binding?.kind === 'import') return { kind: 'import', name: binding.imported ?? fn.text, site: binding.site, line };
    if (binding?.kind === 'local') return { kind: 'local', node: binding.node, name: fn.text, line };
    return null;
  }
  if (fn.type !== 'attribute') return null;
  const object = fn.childForFieldName('object');
  const attribute = fn.childForFieldName('attribute')?.text;
  if (!attribute) return null;
  const dotted = dottedName(object);
  if (dotted == null) return null;
  const binding = object.type === 'identifier' ? resolvePy(dotted, object, ctx) : moduleImport(ctx.root, dotted);
  if (binding?.kind === 'import') return { kind: 'import', name: attribute, site: binding.site, line };
  if (binding?.kind === 'param' && !BUILTIN_METHODS.has(attribute)) return { kind: 'unknown', name: attribute, line };
  return null;
}

function resolvePy(name, from, ctx) {
  for (let scope = from.parent; scope; scope = scope.parent) {
    if (scope.type === 'lambda') {
      if (declaresPythonParameter(scope, name)) return isInlineArgument(scope) ? null : { kind: 'param' };
      continue;
    }
    if (scope.type === 'function_definition') {
      if (declaresPythonParameter(scope, name)) return { kind: 'param' };
      const found = pythonBinding(scope.childForFieldName('body'), name);
      if (found) return found.kind === 'other' ? null : found;
      continue;
    }
    if (scope.type === 'module') {
      const found = pythonBinding(scope, name);
      return found && found.kind !== 'other' ? found : null;
    }
  }
  return null;
}

// Python binds a name anywhere in the function that assigns it, so the whole
// body is searched, without entering nested functions or classes.
function pythonBinding(body, name) {
  const stack = [...(body?.namedChildren ?? [])].reverse();
  while (stack.length > 0) {
    const node = stack.pop();
    const definition = node.type === 'decorated_definition' ? node.childForFieldName('definition') : node;
    if (definition?.type === 'function_definition') {
      if (definition.childForFieldName('name')?.text === name) return { kind: 'local', node: definition };
      continue;
    }
    if (definition?.type === 'class_definition') {
      if (definition.childForFieldName('name')?.text === name) return { kind: 'other' };
      continue;
    }
    if (node.type === 'import_statement' || node.type === 'import_from_statement') {
      const found = pythonImportBinding(node, name);
      if (found) return found;
      continue;
    }
    if (node.type === 'assignment' && node.childForFieldName('left')?.type === 'identifier' && node.childForFieldName('left').text === name) {
      return { kind: 'other' };
    }
    if (PY_FUNCTIONS.has(node.type)) continue;
    for (let i = node.namedChildren.length - 1; i >= 0; i -= 1) stack.push(node.namedChildren[i]);
  }
  return null;
}

function moduleImport(root, dotted) {
  for (const node of root.namedChildren) {
    if (node.type !== 'import_statement') continue;
    const found = pythonImportBinding(node, dotted);
    if (found) return found;
  }
  return null;
}

function pythonImportBinding(node, name) {
  const line = lineOf(node);
  if (node.type === 'import_statement') {
    for (const child of node.namedChildren) {
      if (child.type === 'dotted_name' && child.text === name) return { kind: 'import', site: { specifier: child.text, line }, imported: null };
      if (child.type === 'aliased_import' && child.childForFieldName('alias')?.text === name) {
        return { kind: 'import', site: { specifier: child.childForFieldName('name').text, line }, imported: null };
      }
    }
    return null;
  }
  const module = node.childForFieldName('module_name');
  if (!module) return null;
  const site = { specifier: module.text, line };
  for (const child of node.namedChildren) {
    if (child === module) continue;
    if (child.type === 'dotted_name' && child.text === name) return { kind: 'import', site, imported: name };
    if (child.type === 'aliased_import' && child.childForFieldName('alias')?.text === name) {
      return { kind: 'import', site, imported: child.childForFieldName('name').text };
    }
  }
  return null;
}

function declaresPythonParameter(fn, name) {
  const params = fn.childForFieldName('parameters');
  if (!params) return false;
  return params.namedChildren.some((param) => {
    if (param.type === 'identifier') return param.text === name;
    const inner = param.childForFieldName('name') ?? param.namedChildren.find((child) => child.type === 'identifier');
    return inner?.text === name;
  });
}

function dottedName(node) {
  if (!node) return null;
  if (node.type === 'identifier') return node.text;
  if (node.type !== 'attribute') return null;
  const object = dottedName(node.childForFieldName('object'));
  const attribute = node.childForFieldName('attribute')?.text;
  return object && attribute ? `${object}.${attribute}` : null;
}

function lineOf(node) {
  return node.startPosition.row + 1;
}
