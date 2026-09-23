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

/**
 * @param {object} node a tree-sitter node inside the write call
 * @param {boolean} python
 * @returns {string[]} sorted guards, `ci` and flags such as `--check`
 */
export function writeGuards(node, python) {
  const lang = python ? PYTHON : SCRIPT;
  const guards = new Set();
  const candidates = (condition) => ['ci', ...flagsIn(condition, lang, 0, new Set())];
  const record = (condition, value) => {
    for (const guard of candidates(condition)) if (forced(condition, guard, value, lang, 0, new Set())) guards.add(guard);
  };
  let child = node;
  for (let scope = node.parent; scope; child = scope, scope = scope.parent) {
    if (lang.functions.has(scope.type)) break;
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

function within(node, container) {
  return node.startIndex >= container.startIndex && node.endIndex <= container.endIndex;
}

/**
 * Whether the guard, holding, forces the condition to `value`: a write under
 * a condition that CI forces false does not happen in CI.
 */
function forced(node, guard, value, lang, depth, visiting) {
  if (!node || depth > MAX_DEPTH) return false;
  const next = depth + 1;
  const inner = lang.unwrap(node);
  if (inner !== node) return forced(inner, guard, value, lang, next, visiting);
  const negated = lang.negated(node);
  if (negated) return forced(negated, guard, !value, lang, next, visiting);
  const split = lang.logical(node);
  if (split) {
    const [left, right] = split.operands;
    const l = (v) => forced(left, guard, v, lang, next, visiting);
    const r = (v) => forced(right, guard, v, lang, next, visiting);
    if (split.or) return value ? l(true) || r(true) : l(false) && r(false);
    return value ? l(true) && r(true) : l(false) || r(false);
  }
  const bound = lang.binding(node, visiting);
  if (bound) {
    visiting.add(bound.id);
    const result = forced(bound.value, guard, value, lang, next, visiting);
    visiting.delete(bound.id);
    return result;
  }
  return value === true && lang.atom(node, guard);
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
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (!JS_BLOCKS.has(scope.type)) continue;
    for (const statement of scope.namedChildren) {
      const declaration = statement.type === 'export_statement' ? statement.childForFieldName('declaration') : statement;
      if (declaration?.type !== 'lexical_declaration' && declaration?.type !== 'variable_declaration') continue;
      for (const declarator of declaration.namedChildren) {
        if (declarator.type !== 'variable_declarator' || declarator.childForFieldName('name')?.text !== node.text) continue;
        const id = `${declarator.startIndex}:${declarator.endIndex}`;
        const value = declarator.childForFieldName('value');
        return value && !visiting.has(id) ? { id, value } : null;
      }
    }
  }
  return null;
}

function pythonBinding(node, visiting) {
  if (node.type !== 'identifier') return null;
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (scope.type !== 'module' && scope.type !== 'block') continue;
    for (const statement of scope.namedChildren) {
      const assignment = statement.type === 'expression_statement' ? statement.namedChildren[0] : null;
      if (assignment?.type !== 'assignment' || assignment.childForFieldName('left')?.text !== node.text) continue;
      const id = `${assignment.startIndex}:${assignment.endIndex}`;
      const value = assignment.childForFieldName('right');
      return value && !visiting.has(id) ? { id, value } : null;
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

const SCRIPT = {
  ifType: 'if_statement',
  blockType: 'statement_block',
  blocks: JS_BLOCKS,
  functions: JS_FUNCTIONS,
  hasElse: (statement) => statement.childForFieldName('alternative') != null,
  unwrap: (node) => (node.type === 'parenthesized_expression' ? node.namedChildren[0] : node),
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

function pythonExits(statement) {
  if (statement.type === 'return_statement' || statement.type === 'raise_statement') return true;
  if (statement.type !== 'expression_statement') return false;
  const call = statement.namedChildren[0];
  return call?.type === 'call' && PY_EXITS.has(call.childForFieldName('function')?.text);
}

const PYTHON = {
  ifType: 'if_statement',
  blockType: 'block',
  blocks: PY_BLOCKS,
  functions: PY_FUNCTIONS,
  hasElse: (statement) => statement.childForFieldName('alternative') != null,
  unwrap: (node) => (node.type === 'parenthesized_expression' ? node.namedChildren[0] : node),
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
