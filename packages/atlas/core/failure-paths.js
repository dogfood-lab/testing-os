/**
 * The error-handling constructs a file holds, in source order, each with its
 * kind, line and the function it sits in: `catch` and `throw` in JavaScript
 * and TypeScript, `except` and `raise` in Python, and in Rust an `Err` a
 * function builds (`err`) or matches (`match-err`). They are the failure
 * paths the test-gap rule G6 names in a file no test reaches, and a gap that
 * holds more of them ranks higher: error handling is the code tests reach
 * least (Lima et al. 2021, docs/atlas-test-gaps.dispatch.md). A Rust
 * `#[cfg(test)]` module's own are its tests', not the file's.
 */

const SCRIPT_SITES = { catch_clause: 'catch', throw_statement: 'throw' };
const SITES = {
  javascript: SCRIPT_SITES,
  typescript: SCRIPT_SITES,
  tsx: SCRIPT_SITES,
  python: { except_clause: 'except', except_group_clause: 'except', raise_statement: 'raise' },
};
const SCRIPT_FUNCTIONS = new Set(['function_declaration', 'generator_function_declaration', 'method_definition', 'function_expression', 'function', 'arrow_function', 'generator_function']);

export function failurePaths(language, root) {
  const out = [];
  if (language === 'rust') {
    for (const node of root.descendantsOfType(['call_expression', 'tuple_struct_pattern'])) {
      const head = node.childForFieldName(node.type === 'call_expression' ? 'function' : 'type');
      if (head?.type !== 'identifier' || head.text !== 'Err' || inTestModule(node)) continue;
      out.push(site(node.type === 'call_expression' ? 'err' : 'match-err', node, rustFunction(node)));
    }
  } else {
    const kinds = SITES[language];
    if (!kinds) return [];
    for (const node of root.descendantsOfType(Object.keys(kinds))) {
      out.push(site(kinds[node.type], node, language === 'python' ? pythonFunction(node) : scriptFunction(node)));
    }
  }
  return out;
}

function site(kind, node, fn) {
  return { kind, line: node.startPosition.row + 1, ...(fn ? { in: fn } : {}) };
}

// The nearest function with a name: a declaration's own, or, for a function
// held in a variable, a property or a class field, that name. A callback
// with none is part of the function that hands it on.
function scriptFunction(node) {
  for (let at = node.parent; at != null; at = at.parent) {
    if (!SCRIPT_FUNCTIONS.has(at.type)) continue;
    const own = at.childForFieldName('name');
    if (own) return own.text;
    const holder = at.parent;
    const held = holder?.type === 'variable_declarator' || holder?.type === 'public_field_definition' || holder?.type === 'field_definition' ? holder.childForFieldName('name')
      : holder?.type === 'pair' ? holder.childForFieldName('key')
        : holder?.type === 'assignment_expression' ? holder.childForFieldName('left') : null;
    if (held && /^[\w$.#]+$/.test(held.text)) return held.text;
  }
  return null;
}

function pythonFunction(node) {
  for (let at = node.parent; at != null; at = at.parent) {
    if (at.type === 'function_definition') return at.childForFieldName('name')?.text ?? null;
  }
  return null;
}

function rustFunction(node) {
  for (let at = node.parent; at != null; at = at.parent) {
    if (at.type === 'function_item') return at.childForFieldName('name')?.text ?? null;
  }
  return null;
}

// Inside a module marked #[cfg(test)], the attribute written just before it.
function inTestModule(node) {
  for (let at = node.parent; at != null; at = at.parent) {
    if (at.type !== 'mod_item') continue;
    for (let before = at.previousNamedSibling; before?.type === 'attribute_item'; before = before.previousNamedSibling) {
      if (/\bcfg\s*\(\s*test\s*\)/.test(before.text)) return true;
    }
  }
  return false;
}
