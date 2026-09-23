/**
 * The command lines a JavaScript or TypeScript file hands to a child process,
 * when they are written out in full: execSync('npx tsc -p x.json'), or
 * spawnSync('node', ['scripts/x.mjs']). A door that runs the file runs those
 * commands too, so the map reads them the way it reads a shell script.
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

/**
 * @returns {{ commands: string[], built: number }} the command lines spelled
 *   out in full, and how many calls build their command or arguments at run
 *   time
 */
export function spawnedCommands(root) {
  const found = new Set();
  let built = 0;
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.type === 'call_expression') {
      const read = commandOf(node);
      if (read?.command != null) found.add(read.command);
      else if (read?.built) built += 1;
    }
    for (const child of node.namedChildren) stack.push(child);
  }
  return { commands: [...found].sort(), built };
}

// null when the call hands nothing to a child process; an empty literal
// command names nothing and is not counted as built either.
function commandOf(node) {
  const name = calledName(node.childForFieldName('function'));
  if (name == null) return null;
  const args = node.childForFieldName('arguments')?.namedChildren ?? [];
  if (args.length === 0) return null;
  const program = literal(args[0]);
  if (program == null) return { built: true };
  if (program.trim() === '') return null;
  if (!ARGUMENT_LISTS.has(name)) return { command: program };
  const list = args[1];
  if (list == null || list.type === 'object') return { command: program };
  if (list.type !== 'array') return { built: true };
  const words = list.namedChildren.map(literal);
  if (words.some((word) => word == null)) return { built: true };
  return { command: [program, ...words].map(quoted).join(' ') };
}

function calledName(fn) {
  if (!fn) return null;
  if (fn.type === 'identifier') return COMMAND_CALLS.has(fn.text) ? fn.text : null;
  if (fn.type !== 'member_expression') return null;
  const property = fn.childForFieldName('property')?.text;
  return COMMAND_CALLS.has(property) && !BARE_ONLY.has(property) ? property : null;
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
