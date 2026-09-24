/**
 * The command lines a JavaScript or TypeScript file hands to a child process,
 * when they are written out in full: execSync('npx tsc -p x.json'), or
 * spawnSync('node', ['scripts/x.mjs']). A door that runs the file runs those
 * commands too, so the map reads them the way it reads a shell script.
 *
 * A command line is also read when it is written as a template whose parts
 * name paths the file's own location fixes (`node ${join(ROOT, 'x.mjs')}`),
 * and when it is handed to a helper that runs it: a function whose parameter
 * reaches exec or execSync, or spawn or spawnSync with shell: true, is a
 * helper, and each call to it with a command line written out is a command,
 * followed one level. A helper in another file of the repository is settled
 * once imports resolve (settleSpawnHelpers).
 *
 * A call whose command or arguments are built at run time is not followed:
 * the map states what the file spells, not what it might compute. It is
 * counted, so the page can say how many commands it did not follow.
 */

// exec is also RegExp.prototype.exec, so only a bare exec() call is one of
// these; the other names are unambiguous whether bare or called on a module.
const BARE_ONLY = new Set(['exec', 'spawn']);
const COMMAND_CALLS = new Set(['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync']);
// These take the program and its arguments apart; exec and execSync take one
// shell line.
const ARGUMENT_LISTS = new Set(['execFile', 'execFileSync', 'spawn', 'spawnSync']);
const FUNCTIONS = new Set(['function_declaration', 'function_expression', 'arrow_function', 'function', 'generator_function_declaration']);
// What a template's part the map cannot read becomes: a word the shell
// reader takes for a variable, so it never passes for a path.
const UNREAD = '$ATLAS_BUILT';
// Programs from outside the repository a file runs whatever their arguments,
// which the page says under the door rather than counting the call as a
// command built at run time.
const OUTSIDE_PROGRAMS = new Set(['git', 'gh']);

/**
 * @param {object} root tree-sitter root node
 * @param {(node: object) => string | null} [pathText] the repository path an
 *   expression names, when it names exactly one (core/landings.js scriptPath)
 * @returns {{ commands: string[], built: number, helpers: Record<string, number>, pending: Array<{ specifier: string, name: string, commands: Array<string | null> }> }}
 *   the command lines spelled out in full; how many calls build their command
 *   or arguments at run time; the helpers this file exports, by name, with
 *   the parameter a command line is handed in; and the calls to a function
 *   another file of the repository declares, with what each argument reads
 *   as a command line, to be settled against that file's helpers
 */
export function spawnedCommands(root, pathText = () => null) {
  const found = new Set();
  const programs = new Set();
  let built = 0;
  const helpers = commandHelpers(root);
  const imports = relativeImports(root);
  const pending = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.type === 'call_expression') {
      const read = commandOf(node, pathText, helpers);
      if (read?.command != null) found.add(read.command);
      else if (read?.program != null) programs.add(read.program);
      else if (read?.built) built += 1;
      const first = read?.command?.trim().split(/\s+/)[0];
      if (first != null && OUTSIDE_PROGRAMS.has(first)) programs.add(first);
      const callee = node.childForFieldName('function');
      if (read == null && callee?.type === 'identifier' && imports.has(callee.text)) {
        const args = node.childForFieldName('arguments')?.namedChildren ?? [];
        const { specifier, name } = imports.get(callee.text);
        // Which argument is the command line is the helper's to say.
        if (args.length > 0) pending.push({ specifier, name, commands: args.map((arg) => text(arg, pathText)) });
      }
    }
    for (const child of node.namedChildren) stack.push(child);
  }
  return { commands: [...found].sort(), built, helpers: Object.fromEntries(helpers.exported), pending, programs: [...programs].sort() };
}

/**
 * The commands a file hands to helpers another file exports, now that its
 * imports resolve: a call to a helper with the command written out is a
 * command of the calling file, and one with a command built at run time is
 * counted. A call to any other function hands nothing to a child process.
 *
 * @param {Iterable<object>} files every file of the map, with imports resolved
 * @param {Map<string, string[]>} spawned the commands per file, extended in place
 */
export function settleSpawnHelpers(files, spawned) {
  const byPath = new Map();
  for (const file of files) byPath.set(file.path, file);
  for (const file of byPath.values()) {
    for (const call of file.pendingSpawns ?? []) {
      const site = Array.isArray(file.imports) ? file.imports.find((item) => item.specifier === call.specifier && item.resolved?.outcome === 'file') : null;
      const index = site ? byPath.get(site.resolved.path)?.spawnHelpers?.[call.name] : undefined;
      if (index == null || index >= call.commands.length) continue;
      const command = call.commands[index];
      if (command == null) file.dynamicSpawns = (file.dynamicSpawns ?? 0) + 1;
      else if (command.trim() !== '') spawned.set(file.path, [...new Set([...(spawned.get(file.path) ?? []), command])].sort());
    }
  }
  for (const file of byPath.values()) {
    delete file.pendingSpawns;
    delete file.spawnHelpers;
  }
}

// null when the call hands nothing to a child process; an empty literal
// command names nothing and is not counted as built either. Inside a helper,
// the call that runs the helper's own parameter is counted at each call to
// the helper instead.
function commandOf(node, pathText, helpers) {
  const callee = node.childForFieldName('function');
  const args = node.childForFieldName('arguments')?.namedChildren ?? [];
  if (callee?.type === 'identifier' && helpers.byName.has(callee.text)) {
    const index = helpers.byName.get(callee.text);
    if (args.length <= index) return null;
    const command = text(args[index], pathText);
    if (command == null) return { built: true };
    return command.trim() === '' ? null : { command };
  }
  const name = calledName(callee);
  if (name == null) return null;
  if (args.length === 0) return null;
  if (helpers.params.has(key(args[0]))) return null;
  // spawn(process.execPath, [...]) runs Node.
  const program = args[0]?.text === 'process.execPath' ? 'node' : text(args[0], pathText);
  const list = ARGUMENT_LISTS.has(name) ? arrayOf(args[1]) : null;
  const words = list?.type === 'array' ? list.namedChildren.map((word) => text(word, pathText)) : null;
  // spawn(pythonPath, ['-m', 'jobs']) runs the module whatever interpreter
  // is handed in: -m is Python's, and the module is the program.
  if (program == null && words && words[0] === '-m' && words[1] != null) {
    const known = [];
    for (const word of words) {
      if (word == null) break;
      known.push(word);
    }
    return { command: ['python', ...known].map(quoted).join(' ') };
  }
  if (program == null) return { built: true };
  if (program.trim() === '') return null;
  if (!ARGUMENT_LISTS.has(name)) return { command: program };
  if (list == null || list.type === 'object') return { command: program };
  const outside = OUTSIDE_PROGRAMS.has(program.trim());
  if (list.type !== 'array') return outside ? { program: program.trim() } : { built: true };
  if (words.some((word) => word == null)) return outside ? { program: program.trim() } : { built: true };
  return { command: [program, ...words].map(quoted).join(' ') };
}

/**
 * The functions at the top of a file that run a command line they are handed:
 * a parameter that reaches the first argument of exec or execSync, or of
 * spawn or spawnSync with shell: true, unchanged. `params` holds the argument
 * nodes that are such a parameter, so the call inside the helper is not
 * counted as built at run time.
 */
function commandHelpers(root) {
  const byName = new Map();
  const exported = new Map();
  const params = new Set();
  for (const statement of root.namedChildren) {
    const isExport = statement.type === 'export_statement';
    const declaration = isExport ? statement.childForFieldName('declaration') : statement;
    for (const [name, fn] of declaredFunctions(declaration)) {
      const hit = runsParameter(fn, parameterNames(fn));
      if (hit == null) continue;
      byName.set(name, hit.index);
      params.add(key(hit.node));
      if (isExport) exported.set(name, hit.index);
    }
  }
  return { byName, exported, params };
}

function declaredFunctions(declaration) {
  if (!declaration) return [];
  if (declaration.type === 'function_declaration') {
    const name = declaration.childForFieldName('name')?.text;
    return name ? [[name, declaration]] : [];
  }
  if (declaration.type !== 'lexical_declaration' && declaration.type !== 'variable_declaration') return [];
  const out = [];
  for (const declarator of declaration.namedChildren) {
    if (declarator.type !== 'variable_declarator') continue;
    const value = declarator.childForFieldName('value');
    const name = declarator.childForFieldName('name');
    if (value && FUNCTIONS.has(value.type) && name?.type === 'identifier') out.push([name.text, value]);
  }
  return out;
}

// A parameter's name, or null for one destructured or spread.
function parameterNames(fn) {
  const single = fn.childForFieldName('parameter');
  if (single) return [single.type === 'identifier' ? single.text : null];
  const params = fn.childForFieldName('parameters');
  return (params?.namedChildren ?? []).filter((param) => param.type !== 'comment').map((param) => {
    if (param.type === 'identifier') return param.text;
    const pattern = param.childForFieldName('pattern') ?? param.childForFieldName('left');
    return pattern?.type === 'identifier' ? pattern.text : null;
  });
}

function runsParameter(fn, names) {
  if (!names.some(Boolean)) return null;
  const stack = [fn.childForFieldName('body')].filter(Boolean);
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.type === 'call_expression') {
      const name = calledName(node.childForFieldName('function'));
      const args = node.childForFieldName('arguments')?.namedChildren ?? [];
      const first = args[0];
      const shell = name != null && (!ARGUMENT_LISTS.has(name) || args.slice(1).some(shellOption));
      if (shell && first?.type === 'identifier' && names.includes(first.text)) return { index: names.indexOf(first.text), node: first };
    }
    for (const child of node.namedChildren) if (!FUNCTIONS.has(child.type)) stack.push(child);
  }
  return null;
}

// { shell: true }, the option that makes spawn read its first argument as a
// shell line.
function shellOption(node) {
  if (node?.type !== 'object') return false;
  return node.namedChildren.some((pair) => pair.type === 'pair' && pair.childForFieldName('key')?.text === 'shell' && pair.childForFieldName('value')?.text === 'true');
}

// import { a as b } from './x.js' at the top of the file: b is x's a. Only a
// relative specifier is a file of this repository.
function relativeImports(root) {
  const out = new Map();
  for (const statement of root.namedChildren) {
    if (statement.type !== 'import_statement') continue;
    const specifier = literal(statement.childForFieldName('source'));
    if (specifier == null || !specifier.startsWith('.')) continue;
    const clause = statement.namedChildren.find((child) => child.type === 'import_clause');
    for (const part of clause?.namedChildren ?? []) {
      if (part.type !== 'named_imports') continue;
      for (const spec of part.namedChildren) {
        if (spec.type !== 'import_specifier') continue;
        const name = spec.childForFieldName('name')?.text;
        const alias = spec.childForFieldName('alias')?.text ?? name;
        if (name && alias) out.set(alias, { specifier, name });
      }
    }
  }
  return out;
}

// An argument list named by a const the file declares in an enclosing scope
// is that array: const args = ['-m', 'ml_runner']; spawn(python, args).
// Items pushed onto it later come after, and are left unread.
function arrayOf(node) {
  if (node?.type !== 'identifier') return node;
  for (let scope = node.parent; scope; scope = scope.parent) {
    for (const statement of scope.namedChildren ?? []) {
      if (statement.type !== 'lexical_declaration' || !statement.children.some((child) => child.type === 'const')) continue;
      if (statement.startIndex > node.startIndex) continue;
      for (const declarator of statement.namedChildren) {
        if (declarator.type !== 'variable_declarator' || declarator.childForFieldName('name')?.text !== node.text) continue;
        const value = declarator.childForFieldName('value');
        return value?.type === 'array' ? value : node;
      }
    }
  }
  return node;
}

function calledName(fn) {
  if (!fn) return null;
  if (fn.type === 'identifier') return COMMAND_CALLS.has(fn.text) ? fn.text : null;
  if (fn.type !== 'member_expression') return null;
  const property = fn.childForFieldName('property')?.text;
  return COMMAND_CALLS.has(property) && !BARE_ONLY.has(property) ? property : null;
}

function key(node) {
  return `${node.startIndex}:${node.endIndex}`;
}

// A literal, or a template whose program the map can read: each part it
// cannot read stands as a variable word. A template with such a part in its
// program, or in the first argument after it that is not a flag (the script
// node runs), names nothing to follow, and is built at run time; one whose
// unread parts come later (node x.mjs ${tgz}) still runs x.mjs.
function text(node, pathText) {
  const plain = literal(node);
  if (plain != null || node?.type !== 'template_string') return plain;
  let out = '';
  for (const child of node.namedChildren) {
    if (child.type !== 'template_substitution') out += child.type === 'escape_sequence' ? unescaped(child.text) : child.text;
    else {
      const path = child.namedChildren[0] ? pathText(child.namedChildren[0]) : null;
      out += path == null ? UNREAD : path === '' ? '.' : path;
    }
  }
  const words = out.trim().split(/\s+/);
  const script = words.slice(1).find((word) => !word.startsWith('-'));
  return words[0]?.includes(UNREAD) || script?.includes(UNREAD) ? null : out;
}

function literal(node) {
  if (!node) return null;
  if (node.type === 'string') {
    let text = '';
    for (const child of node.namedChildren) {
      if (child.type === 'string_fragment') text += child.text;
      else if (child.type === 'escape_sequence') text += unescaped(child.text);
      else return null;
    }
    return text;
  }
  if (node.type === 'template_string') {
    if (node.namedChildren.some((child) => child.type === 'template_substitution')) return null;
    return node.text.slice(1, -1);
  }
  return null;
}

function unescaped(sequence) {
  const ch = sequence[1];
  if (ch === 'n') return '\n';
  if (ch === 't') return '\t';
  return ch ?? '';
}

// An argument holding a space is one word, as the process receives it.
function quoted(word) {
  return /[\s"'$`\\]/.test(word) ? `'${word.replaceAll("'", "'\\''")}'` : word;
}
