/**
 * The conditions under which a write in a file does not happen, read from the
 * file itself: the writer's own guards.
 *
 * Two kinds are read, because they decide whether a door's run of the file
 * writes at all. A write that is skipped when CI or GITHUB_ACTIONS is set
 * never happens in a workflow (world-forge's sync-version refuses to stamp
 * README.md on a runner). A write that is skipped when a flag is passed
 * (--check, --selftest, --dry-run) never happens in a run that passes it.
 * The write is skipped either because it sits in the branch of an if that
 * does not run under the condition, or because an earlier statement in the
 * same block leaves (exit, return, throw) when the condition holds.
 *
 * A guard is `ci` or the flag itself, and a write carries the list as
 * `unless`. Only what a condition forces is read: `a || b` leaves when either
 * does, `a && b` only when both do, and a name bound to a condition in the
 * file is read as the condition. Anything else guards nothing.
 *
 * A third kind decides whether the write happens at all once the file is
 * committed: `exists`, a write skipped when the file it writes is already
 * there (if (!existsSync(p)) writeFileSync(p, ...), an early return when it
 * exists, or a write in the catch of a try that reads it first). Such a write
 * bootstraps the file once; a checkout holds it, so no door makes it. The
 * file is the one the write names, compared by the text of the path.
 *
 * A fourth kind decides which doors a write belongs to: `main`, a write the
 * file makes only when it is the program being run, behind a main guard
 * (import.meta.url or a path compared with process.argv[1], require.main ===
 * module, import.meta.main, Python's __name__ == "__main__"). An import of
 * the file never reaches it. A module-level function the file never exports,
 * every mention of which is behind that guard, is the file's command as well:
 * const table = { fetch: cmdFetch } inside the guard, or main() under
 * __name__. A module-level Python function cannot be told apart from one
 * another module imports, so there only the mentions in the file decide.
 */

const CI_VARIABLES = new Set(['CI', 'GITHUB_ACTIONS']);
const JS_FUNCTIONS = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_expression',
  'function',
  'generator_function',
  'arrow_function',
  'method_definition',
]);
const JS_BLOCKS = new Set(['program', 'statement_block']);
const PY_FUNCTIONS = new Set(['function_definition', 'lambda']);
const PY_BLOCKS = new Set(['module', 'block']);
const PY_EXITS = new Set(['sys.exit', 'exit', 'quit', 'os._exit']);
const MAX_DEPTH = 8;
// A function mentioned only from inside other such functions is followed
// this many functions out before it is read as reachable by an import.
const MAIN_HOPS = 4;
const MENTIONS = new Set(['identifier', 'shorthand_property_identifier']);
const OWN_RUN = 'process.argv[1]';
const TESTED_BY = new Set(['includes', 'endsWith', 'startsWith', 'match', 'test']);
const JS_EXISTS = new Set(['existsSync', 'pathExistsSync', 'pathExists']);
const JS_READS = new Set(['readFileSync', 'readFile', 'statSync', 'stat', 'accessSync', 'access', 'openSync', 'readJsonSync', 'readJSONSync']);
const PY_EXISTS = new Set(['os.path.exists', 'os.path.isfile', 'path.exists', 'path.isfile', 'exists', 'isfile']);
const PY_RECEIVER_EXISTS = new Set(['exists', 'is_file']);
const PY_RECEIVER_READS = new Set(['read_text', 'read_bytes', 'open', 'stat']);

/**
 * @param {object} node a tree-sitter node inside the write call
 * @param {boolean} python
 * @returns {string[]} sorted guards, `ci` and flags such as `--check`
 */
export function writeGuards(node, python) {
  return guardsAt(node, python ? PYTHON : SCRIPT, pathText(node), 0);
}

/**
 * Whether a node runs only when its file is the program being run: behind a
 * main guard in its own function, or in a function that is the file's
 * command (see above). A call behind one is how a parameter's default is
 * reached only by a run of the file (landings.js settleParamPaths).
 *
 * @param {object} node a tree-sitter node
 * @param {boolean} python
 * @returns {boolean}
 */
export function mainOnly(node, python) {
  return guardsAt(node, python ? PYTHON : SCRIPT, null, 0).includes('main');
}

function guardsAt(node, lang, target, hops) {
  const guards = new Set();
  const candidates = (condition) => ['ci', 'main', ...(target ? ['exists'] : []), ...conditionFlags(condition, lang)];
  const record = (condition, value) => {
    for (const guard of candidates(condition)) if (forced(condition, guard, value, lang, 0, new Set(), target)) guards.add(guard);
  };
  let child = node;
  for (let scope = node.parent; scope; child = scope, scope = scope.parent) {
    if (lang.functions.has(scope.type)) {
      if (commandFunction(scope, lang, hops)) guards.add('main');
      break;
    }
    // A write in the catch of a try that reads the same file runs only when
    // that read failed: the file was not there.
    if (target && scope.type === lang.catchType && lang.readsFirst(scope.parent, target)) guards.add('exists');
    if (scope.type === lang.ifType) {
      const condition = scope.childForFieldName('condition');
      const consequence = scope.childForFieldName('consequence');
      if (condition && consequence && within(child, consequence)) record(condition, false);
      else if (condition && child !== condition && !within(child, condition)) record(condition, true);
    }
    if (!lang.blocks.has(scope.type)) continue;
    for (const statement of scope.namedChildren) {
      if (statement.startIndex >= child.startIndex) break;
      if (statement.type !== lang.ifType || lang.hasElse(statement)) continue;
      const consequence = statement.childForFieldName('consequence');
      const condition = statement.childForFieldName('condition');
      if (condition && consequence && leaves(consequence, lang)) record(condition, true);
    }
  }
  return [...guards].sort();
}

// What commandFunction found for each function of a tree, by the tree: the
// answer depends only on the tree, the function, the language and the hops,
// and finding it walks the whole file, which a large file with many guarded
// calls would otherwise do once per call.
const COMMAND_FUNCTIONS = new WeakMap();

// A module-level function the file does not export, mentioned at least once
// and only where the file runs as a program.
function commandFunction(fn, lang, hops) {
  if (hops >= MAIN_HOPS) return false;
  let known = COMMAND_FUNCTIONS.get(fn.tree);
  if (!known) {
    known = new Map();
    COMMAND_FUNCTIONS.set(fn.tree, known);
  }
  const key = `${lang === PYTHON ? 'py' : 'js'}\0${fn.startIndex}\0${fn.endIndex}\0${hops}`;
  if (!known.has(key)) known.set(key, findCommandFunction(fn, lang, hops));
  return known.get(key);
}

function findCommandFunction(fn, lang, hops) {
  const named = lang.moduleFunction(fn);
  if (named == null || named.exported) return false;
  // An export clause, module.exports = { fn } and a recursive call are
  // mentions too; only the first two are ever outside the guard.
  const mentions = mentionsOf(fn.tree, fn).get(named.name) ?? [];
  const outside = mentions.filter((mention) => !(mention.startIndex >= fn.startIndex && mention.endIndex <= fn.endIndex));
  return outside.length > 0 && outside.every((mention) => guardsAt(mention, lang, null, hops + 1).includes('main'));
}

const MENTION_INDEX = new WeakMap();

// Every node of the tree that can mention a function, by the name it spells,
// found in one walk of the whole file for all the functions asked about.
function mentionsOf(tree, node) {
  if (MENTION_INDEX.has(tree)) return MENTION_INDEX.get(tree);
  let program = node;
  while (program.parent) program = program.parent;
  const index = new Map();
  const stack = [program];
  while (stack.length > 0) {
    const current = stack.pop();
    if (MENTIONS.has(current.type)) {
      const name = current.text;
      if (!index.has(name)) index.set(name, []);
      index.get(name).push(current);
    }
    stack.push(...current.namedChildren);
  }
  MENTION_INDEX.set(tree, index);
  return index;
}

function within(node, container) {
  return node.startIndex >= container.startIndex && node.endIndex <= container.endIndex;
}

/**
 * Whether the guard, holding, forces the condition to `value`: a write under
 * a condition that CI forces false does not happen in CI.
 */
function forced(node, guard, value, lang, depth, visiting, target) {
  if (!node || depth > MAX_DEPTH) return false;
  const next = depth + 1;
  const inner = lang.unwrap(node);
  if (inner !== node) return forced(inner, guard, value, lang, next, visiting, target);
  const negated = lang.negated(node);
  if (negated) return forced(negated, guard, !value, lang, next, visiting, target);
  const split = lang.logical(node);
  if (split) {
    const [left, right] = split.operands;
    const l = (v) => forced(left, guard, v, lang, next, visiting, target);
    const r = (v) => forced(right, guard, v, lang, next, visiting, target);
    if (split.or) return value ? l(true) || r(true) : l(false) && r(false);
    return value ? l(true) && r(true) : l(false) || r(false);
  }
  const bound = lang.binding(node, visiting);
  if (bound) {
    visiting.add(bound.id);
    const result = forced(bound.value, guard, value, lang, next, visiting, target);
    visiting.delete(bound.id);
    return result;
  }
  if (guard === 'exists') return value === true && lang.exists(node, target);
  // Imported, the file is not the program: a test that it is reads false.
  if (guard === 'main') {
    const test = lang.mainTest(node, visiting);
    return test === 'is' ? value === false : test === 'not' ? value === true : false;
  }
  return value === true && lang.atom(node, guard);
}

// The text a path is written as, spaces aside: BASELINE_PATH, join(dir, 'x').
function pathText(node) {
  const text = node?.text?.replace(/\s+/g, '') ?? '';
  return text === '' ? null : text;
}

// existsSync(p), fs.existsSync(p) and fs-extra's pathExists(p), of the path.
function scriptExists(node, target) {
  if (node.type === 'await_expression') return scriptExists(node.namedChildren[0], target);
  if (node.type !== 'call_expression') return false;
  const fn = node.childForFieldName('function');
  const name = fn?.type === 'member_expression' ? fn.childForFieldName('property')?.text : fn?.text;
  if (!JS_EXISTS.has(name)) return false;
  return pathText(node.childForFieldName('arguments')?.namedChildren[0]) === target;
}

// A try whose body reads the path before anything writes it.
function scriptReadsFirst(tryStatement, target) {
  const body = tryStatement?.childForFieldName('body');
  if (!body) return false;
  const stack = [body];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current.type === 'call_expression') {
      const fn = current.childForFieldName('function');
      const name = fn?.type === 'member_expression' ? fn.childForFieldName('property')?.text : fn?.text;
      if (JS_READS.has(name) && pathText(current.childForFieldName('arguments')?.namedChildren[0]) === target) return true;
    }
    stack.push(...current.namedChildren);
  }
  return false;
}

/**
 * A lookup made once per node of a tree: the tree, the language and the
 * node's type and range are the key, so the node objects the parser hands
 * out anew on every access still meet the same entry. Every call site under
 * one condition asks about the same condition, and every identifier in it
 * about the same declaration; a large file asks thousands of times.
 */
function perNode(cache, node, lang, find) {
  let known = cache.get(node.tree);
  if (!known) {
    known = new Map();
    cache.set(node.tree, known);
  }
  const key = `${lang === PYTHON ? 'py' : 'js'}\0${node.type}\0${node.startIndex}\0${node.endIndex}`;
  if (!known.has(key)) known.set(key, find());
  return known.get(key);
}

const CONDITION_FLAGS = new WeakMap();
const DECLARATIONS = new WeakMap();

// The flags a condition tests, followed from no name already on the way.
function conditionFlags(condition, lang) {
  return perNode(CONDITION_FLAGS, condition, lang, () => flagsIn(condition, lang, 0, new Set()));
}

// The flags a condition tests, by name, through the names it is bound to.
function flagsIn(node, lang, depth, visiting) {
  if (!node || depth > MAX_DEPTH) return [];
  const found = new Set();
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    const flag = lang.flag(current);
    if (flag) found.add(flag);
    const bound = lang.binding(current, visiting);
    if (bound) {
      visiting.add(bound.id);
      for (const item of flagsIn(bound.value, lang, depth + 1, visiting)) found.add(item);
      visiting.delete(bound.id);
    }
    stack.push(...current.namedChildren);
  }
  return [...found];
}

// A block leaves when its last statement exits the process, returns or throws.
function leaves(block, lang) {
  const statements = block.type === lang.blockType ? block.namedChildren.filter((child) => child.type !== 'comment') : [block];
  const last = statements[statements.length - 1];
  return last != null && lang.exits(last);
}

function stringText(node) {
  if (node?.type !== 'string') return null;
  return node.namedChildren
    .filter((child) => child.type === 'string_fragment' || child.type === 'string_content')
    .map((child) => child.text)
    .join('');
}

function flagText(node) {
  const text = stringText(node);
  return text != null && /^--?[A-Za-z][\w-]*$/.test(text) ? text : null;
}

// A const or let bound once in an enclosing block to the expression.
function scriptBinding(node, visiting) {
  if (node.type !== 'identifier') return null;
  const found = perNode(DECLARATIONS, node, SCRIPT, () => scriptDeclarator(node));
  return found?.value && !visiting.has(found.id) ? found : null;
}

// The first declarator of the name in the nearest enclosing block, with or
// without a value; null when no enclosing block declares it.
function scriptDeclarator(node) {
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (!JS_BLOCKS.has(scope.type)) continue;
    for (const statement of scope.namedChildren) {
      const declaration = statement.type === 'export_statement' ? statement.childForFieldName('declaration') : statement;
      if (declaration?.type !== 'lexical_declaration' && declaration?.type !== 'variable_declaration') continue;
      for (const declarator of declaration.namedChildren) {
        if (declarator.type !== 'variable_declarator' || declarator.childForFieldName('name')?.text !== node.text) continue;
        return { id: `${declarator.startIndex}:${declarator.endIndex}`, value: declarator.childForFieldName('value') };
      }
    }
  }
  return null;
}

function pythonBinding(node, visiting) {
  if (node.type !== 'identifier') return null;
  const found = perNode(DECLARATIONS, node, PYTHON, () => pythonAssignment(node));
  return found?.value && !visiting.has(found.id) ? found : null;
}

// The first assignment to the name in the nearest enclosing module or block.
function pythonAssignment(node) {
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (scope.type !== 'module' && scope.type !== 'block') continue;
    for (const statement of scope.namedChildren) {
      const assignment = statement.type === 'expression_statement' ? statement.namedChildren[0] : null;
      if (assignment?.type !== 'assignment' || assignment.childForFieldName('left')?.text !== node.text) continue;
      return { id: `${assignment.startIndex}:${assignment.endIndex}`, value: assignment.childForFieldName('right') };
    }
  }
  return null;
}

// process.env.CI, process.env['CI'], and the same compared with a string.
function scriptCiAtom(node) {
  if (node.type === 'binary_expression') {
    const operator = node.childForFieldName('operator')?.text;
    if (operator !== '===' && operator !== '==') return false;
    const left = node.childForFieldName('left');
    const right = node.childForFieldName('right');
    return (scriptCiRead(left) && right?.type === 'string') || (scriptCiRead(right) && left?.type === 'string');
  }
  if (node.type === 'call_expression' && node.childForFieldName('function')?.text === 'Boolean') {
    const arg = node.childForFieldName('arguments')?.namedChildren[0];
    return arg != null && scriptCiRead(arg);
  }
  return scriptCiRead(node);
}

function scriptCiRead(node) {
  if (node?.type === 'member_expression') {
    return node.childForFieldName('object')?.text === 'process.env' && CI_VARIABLES.has(node.childForFieldName('property')?.text);
  }
  if (node?.type === 'subscript_expression') {
    return node.childForFieldName('object')?.text === 'process.env' && CI_VARIABLES.has(stringText(node.childForFieldName('index')));
  }
  return false;
}

// argv.includes('--check'), whatever the array is called.
function scriptFlag(node) {
  if (node.type !== 'call_expression') return null;
  const fn = node.childForFieldName('function');
  if (fn?.type !== 'member_expression' || fn.childForFieldName('property')?.text !== 'includes') return null;
  return flagText(node.childForFieldName('arguments')?.namedChildren[0]);
}

function scriptExits(statement) {
  if (statement.type === 'return_statement' || statement.type === 'throw_statement') return true;
  if (statement.type !== 'expression_statement') return false;
  const call = statement.namedChildren[0];
  return call?.type === 'call_expression' && call.childForFieldName('function')?.text === 'process.exit';
}

// Whether a node tests that this file is the program being run: is, not, or
// neither. process.argv[1] compared with anything, or tested for a name
// (process.argv[1]?.includes('format-sft')), through the names it is bound
// to; require.main === module; import.meta.main.
function scriptMainTest(node, visiting) {
  if (node.type === 'member_expression' && node.text.replace(/\s+/g, '') === 'import.meta.main') return 'is';
  if (node.type === 'binary_expression') {
    const operator = node.childForFieldName('operator')?.text;
    const sense = operator === '===' || operator === '==' ? 'is' : operator === '!==' || operator === '!=' ? 'not' : null;
    if (sense == null) return null;
    const left = node.childForFieldName('left');
    const right = node.childForFieldName('right');
    const pair = [left?.text, right?.text].sort().join(' ');
    if (pair === 'module require.main') return sense;
    return runPathIn(left, visiting) || runPathIn(right, visiting) ? sense : null;
  }
  if (node.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    if (fn?.type !== 'member_expression' || !TESTED_BY.has(fn.childForFieldName('property')?.text)) return null;
    return runPathIn(node, visiting) ? 'is' : null;
  }
  return null;
}

// process.argv[1], written out or through a name bound to it once.
function runPathIn(node, visiting) {
  if (!node) return false;
  if (node.text.replace(/\s+/g, '').includes(OWN_RUN)) return true;
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current.type === 'identifier') {
      const bound = scriptBinding(current, visiting);
      if (bound && bound.value.text.replace(/\s+/g, '').includes(OWN_RUN)) return true;
    }
    stack.push(...current.namedChildren);
  }
  return false;
}

// A function declared at the top of the module, by name, and whether the
// declaration exports it.
function scriptModuleFunction(fn) {
  const top = (node) => node?.type === 'program';
  if (fn.type === 'function_declaration' || fn.type === 'generator_function_declaration') {
    const id = fn.childForFieldName('name');
    if (!id) return null;
    if (top(fn.parent)) return { name: id.text, id, exported: false };
    if (fn.parent?.type === 'export_statement' && top(fn.parent.parent)) return { name: id.text, id, exported: true };
    return null;
  }
  const declarator = fn.parent;
  if (declarator?.type !== 'variable_declarator' || declarator.childForFieldName('value')?.startIndex !== fn.startIndex) return null;
  const id = declarator.childForFieldName('name');
  if (id?.type !== 'identifier') return null;
  const declaration = declarator.parent;
  if (top(declaration?.parent)) return { name: id.text, id, exported: false };
  if (declaration?.parent?.type === 'export_statement' && top(declaration.parent.parent)) return { name: id.text, id, exported: true };
  return null;
}

const SCRIPT = {
  ifType: 'if_statement',
  catchType: 'catch_clause',
  exists: scriptExists,
  readsFirst: scriptReadsFirst,
  blockType: 'statement_block',
  blocks: JS_BLOCKS,
  functions: JS_FUNCTIONS,
  hasElse: (statement) => statement.childForFieldName('alternative') != null,
  // Boolean(x) is x, as a condition.
  unwrap: (node) => (node.type === 'parenthesized_expression' ? node.namedChildren[0]
    : node.type === 'call_expression' && node.childForFieldName('function')?.text === 'Boolean' && node.childForFieldName('arguments')?.namedChildren.length === 1
      ? node.childForFieldName('arguments').namedChildren[0]
      : node),
  mainTest: scriptMainTest,
  moduleFunction: scriptModuleFunction,
  negated: (node) => (node.type === 'unary_expression' && node.childForFieldName('operator')?.text === '!' ? node.childForFieldName('argument') : null),
  logical(node) {
    if (node.type !== 'binary_expression') return null;
    const operator = node.childForFieldName('operator')?.text;
    if (operator !== '||' && operator !== '&&') return null;
    return { or: operator === '||', operands: [node.childForFieldName('left'), node.childForFieldName('right')] };
  },
  binding: scriptBinding,
  atom: (node, guard) => (guard === 'ci' ? scriptCiAtom(node) : scriptFlag(node) === guard),
  flag: scriptFlag,
  exits: scriptExits,
};

// os.environ.get('CI'), os.getenv('CI'), os.environ['CI'], "CI" in os.environ.
function pythonCiAtom(node) {
  if (node.type === 'call') {
    const name = node.childForFieldName('function')?.text;
    if (name !== 'os.environ.get' && name !== 'os.getenv') return false;
    return CI_VARIABLES.has(stringText(node.childForFieldName('arguments')?.namedChildren[0]));
  }
  if (node.type === 'subscript') {
    return node.childForFieldName('value')?.text === 'os.environ' && CI_VARIABLES.has(stringText(node.childForFieldName('subscript')));
  }
  if (node.type === 'comparison_operator') {
    const [left, right] = node.namedChildren;
    if (node.children.some((child) => child.type === 'in') && right?.text === 'os.environ') return CI_VARIABLES.has(stringText(left));
    if (node.children.some((child) => child.type === '==')) return pythonCiAtom(left) && right?.type === 'string';
  }
  return false;
}

// "--check" in sys.argv, whatever the list is called.
function pythonFlag(node) {
  if (node.type !== 'comparison_operator' || !node.children.some((child) => child.type === 'in')) return null;
  if (node.children.some((child) => child.type === 'not')) return null;
  return flagText(node.namedChildren[0]);
}

// os.path.exists(p), os.path.isfile(p), p.exists() and p.is_file().
function pythonExists(node, target) {
  if (node.type !== 'call') return false;
  const fn = node.childForFieldName('function');
  if (fn?.type === 'attribute' && PY_RECEIVER_EXISTS.has(fn.childForFieldName('attribute')?.text) && pathText(fn.childForFieldName('object')) === target) return true;
  if (!PY_EXISTS.has(fn?.text)) return false;
  return pathText(node.childForFieldName('arguments')?.namedChildren[0]) === target;
}

// A try whose body opens or reads the path: open(p), p.read_text().
function pythonReadsFirst(tryStatement, target) {
  const body = tryStatement?.childForFieldName('body');
  if (!body) return false;
  const stack = [body];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current.type === 'call') {
      const fn = current.childForFieldName('function');
      if (fn?.type === 'identifier' && fn.text === 'open' && pathText(current.childForFieldName('arguments')?.namedChildren[0]) === target) return true;
      if (fn?.type === 'attribute' && PY_RECEIVER_READS.has(fn.childForFieldName('attribute')?.text) && pathText(fn.childForFieldName('object')) === target) return true;
    }
    stack.push(...current.namedChildren);
  }
  return false;
}

function pythonExits(statement) {
  if (statement.type === 'return_statement' || statement.type === 'raise_statement') return true;
  if (statement.type !== 'expression_statement') return false;
  const call = statement.namedChildren[0];
  return call?.type === 'call' && PY_EXITS.has(call.childForFieldName('function')?.text);
}

// __name__ == "__main__", either way round.
function pythonMainTest(node) {
  if (node.type !== 'comparison_operator') return null;
  const sense = node.children.some((child) => child.type === '==') ? 'is' : node.children.some((child) => child.type === '!=') ? 'not' : null;
  if (sense == null) return null;
  const [left, right] = node.namedChildren;
  const named = (a, b) => a?.type === 'identifier' && a.text === '__name__' && stringText(b) === '__main__';
  return named(left, right) || named(right, left) ? sense : null;
}

// Every function defined at the top of a module can be imported by name.
function pythonModuleFunction(fn) {
  if (fn.type !== 'function_definition') return null;
  const holder = fn.parent?.type === 'decorated_definition' ? fn.parent.parent : fn.parent;
  const id = fn.childForFieldName('name');
  return holder?.type === 'module' && id ? { name: id.text, id, exported: false } : null;
}

const PYTHON = {
  ifType: 'if_statement',
  catchType: 'except_clause',
  exists: pythonExists,
  readsFirst: pythonReadsFirst,
  blockType: 'block',
  blocks: PY_BLOCKS,
  functions: PY_FUNCTIONS,
  hasElse: (statement) => statement.childForFieldName('alternative') != null,
  unwrap: (node) => (node.type === 'parenthesized_expression' ? node.namedChildren[0] : node),
  mainTest: pythonMainTest,
  moduleFunction: pythonModuleFunction,
  negated: (node) => (node.type === 'not_operator' ? node.childForFieldName('argument') : null),
  logical(node) {
    if (node.type !== 'boolean_operator') return null;
    const operator = node.childForFieldName('operator')?.text;
    return { or: operator === 'or', operands: [node.childForFieldName('left'), node.childForFieldName('right')] };
  },
  binding: pythonBinding,
  atom: (node, guard) => (guard === 'ci' ? pythonCiAtom(node) : pythonFlag(node) === guard),
  flag: pythonFlag,
  exits: pythonExits,
};
