/**
 * What an import binds, read from the tree (docs/atlas-buildup.spec.md,
 * slice AQ): the names it takes from the module and whether each is a type.
 * An import site was only its specifier, kind and line; the tiers of AQ ask
 * whether a consumer imports the name that changed, as a value or only as a
 * type, so the sites also carry `bound`, and the map records it for the
 * imports of packages (core/package-facts.js, importNames).
 *
 * A name is the name the module exports (`a` in `import { a as b }`), never
 * the local alias; `default` is the default export and `*` is the whole
 * namespace, or names this reading cannot tell (a bare require, an import()
 * whose result is used some other way).
 */

/**
 * @typedef {{ name: string, type?: true }} BoundName
 * @typedef {{ form: 'import'|'reexport'|'require'|'dynamic'|'type-import', typeOnly: boolean, names: BoundName[], sideEffect?: true }} Bound
 */

/** What a site that names nothing in particular binds: the whole module, as far as the tree says. */
export function unknownBinding(form = 'dynamic') {
  return { form, typeOnly: false, names: [{ name: '*' }] };
}

// A keyword the grammar keeps as an anonymous child of the node.
function hasKeyword(node, keyword) {
  return node.children.some((child) => !child.isNamed && child.type === keyword);
}

function nameText(node, str) {
  if (!node) return null;
  if (node.type === 'string') return str(node);
  return node.text;
}

// One import or export specifier: the name the module exports, and whether
// the specifier itself says it is a type (`type D` inside the braces).
function specifier(node, str) {
  const name = nameText(node.childForFieldName('name') ?? node.namedChildren[0], str);
  if (name == null || name === '') return null;
  return { name, ...(hasKeyword(node, 'type') ? { type: true } : {}) };
}

function finish(form, names, statementType, extra = {}) {
  const bound = statementType ? names.map((entry) => ({ name: entry.name, type: true })) : names;
  return { form, typeOnly: statementType || (bound.length > 0 && bound.every((entry) => entry.type === true)), names: bound, ...extra };
}

/**
 * The binding of an import statement with a source or with none (a side-effect import).
 * (The `import name = require(…)` form is not read: the extractor makes no site for it,
 * so there is nothing to bind.)
 *
 * @param {object} node an import_statement
 * @param {(node: object) => string|null} str the string literal's value
 * @returns {Bound}
 */
export function importBinding(node, str) {
  const statementType = hasKeyword(node, 'type');
  const clause = node.namedChildren.find((child) => child.type === 'import_clause');
  if (!clause) return { form: 'import', typeOnly: false, names: [], sideEffect: true };
  const names = [];
  for (const child of clause.namedChildren) {
    if (child.type === 'identifier') names.push({ name: 'default' });
    else if (child.type === 'namespace_import') names.push({ name: '*' });
    else if (child.type === 'named_imports') {
      for (const item of child.namedChildren) {
        if (item.type !== 'import_specifier') continue;
        const bound = specifier(item, str);
        if (bound) names.push(bound);
      }
    }
  }
  // import {} from … still loads the module, for its effects, unless it is a type import.
  if (names.length === 0) return { form: 'import', typeOnly: statementType, names: [], ...(statementType ? {} : { sideEffect: true }) };
  return finish('import', names, statementType);
}

/**
 * The binding of an export statement that has a source: the names it hands on.
 *
 * @param {object} node an export_statement that has a source
 * @param {(node: object) => string|null} str the string literal's value
 * @returns {Bound}
 */
export function exportBinding(node, str) {
  const statementType = hasKeyword(node, 'type');
  const names = [];
  if (hasKeyword(node, '*') || node.namedChildren.some((child) => child.type === 'namespace_export')) names.push({ name: '*' });
  const clause = node.namedChildren.find((child) => child.type === 'export_clause');
  if (clause) {
    for (const item of clause.namedChildren) {
      if (item.type !== 'export_specifier') continue;
      const bound = specifier(item, str);
      if (bound) names.push(bound);
    }
  }
  return finish('reexport', names, statementType);
}

// The names a destructuring pattern takes from an object.
function patternNames(pattern, str) {
  const names = [];
  for (const child of pattern.namedChildren) {
    if (child.type === 'shorthand_property_identifier_pattern') names.push({ name: child.text });
    else if (child.type === 'pair_pattern') {
      const key = nameText(child.childForFieldName('key'), str);
      names.push({ name: key == null || key === '' ? '*' : key });
    } else if (child.type === 'object_assignment_pattern') {
      const left = child.childForFieldName('left');
      if (left?.type === 'shorthand_property_identifier_pattern') names.push({ name: left.text });
      else names.push({ name: '*' });
    } else names.push({ name: '*' });
  }
  return names.length > 0 ? names : [{ name: '*' }];
}

/**
 * The binding of a require call or an import call with a literal: the names
 * destructured from it when the result is bound at once (a const object pattern
 * on the call, or on its await), else the whole module.
 *
 * @param {object} call the call_expression
 * @param {'require'|'dynamic'} form
 * @param {(node: object) => string|null} str the string literal's value
 * @returns {Bound}
 */
export function callBinding(call, form, str) {
  const typed = typePositionBinding(call);
  if (typed) return typed;
  let value = call;
  let parent = call.parent;
  if (parent?.type === 'await_expression') {
    value = parent;
    parent = parent.parent;
  }
  if (parent?.type === 'variable_declarator') {
    const assigned = parent.childForFieldName('value');
    const target = parent.childForFieldName('name');
    if (assigned && assigned.id === value.id && target?.type === 'object_pattern') {
      return { form, typeOnly: false, names: patternNames(target, str) };
    }
  }
  return unknownBinding(form);
}

// Where a type, not a value, is written: a type annotation, a type alias, an
// interface, type arguments and parameters, and a typeof query.
const TYPE_CONTEXT = new Set(['type_query', 'type_annotation', 'type_alias_declaration', 'type_arguments', 'type_parameters', 'interface_declaration', 'extends_type_clause', 'implements_clause']);

/**
 * The binding of an import call written as a type, or null when it is a
 * value: `let x: typeof import(…)`, `type T = import(…).Foo`, a parameter
 * typed `import(…).Opts`. The vendored grammar also reads
 * `identity<typeof import(…)>()` as comparisons, so a typeof applied to an
 * import call is a type query wherever it appears. A member read straight off
 * the call names the type taken (`Foo`); else the whole module.
 *
 * @param {object} call the call_expression
 * @returns {Bound|null}
 */
function typePositionBinding(call) {
  let typed = call.parent?.type === 'unary_expression' && call.parent.children[0]?.text === 'typeof';
  for (let node = call.parent; node && !typed; node = node.parent) {
    if (TYPE_CONTEXT.has(node.type)) typed = true;
    // A value statement ends the climb: nothing above it is a type.
    if (node.type === 'variable_declarator' || node.type === 'expression_statement' || node.type === 'return_statement') break;
  }
  if (!typed) return null;
  const member = call.parent?.type === 'member_expression' && call.parent.childForFieldName('object')?.id === call.id ? call.parent.childForFieldName('property') : null;
  return { form: 'type-import', typeOnly: true, names: [{ name: member ? member.text : '*', type: true }] };
}

/** What a type-position import call (or typeof of one) binds: a type of the module. */
export function typeImportBinding() {
  return { form: 'type-import', typeOnly: true, names: [{ name: '*', type: true }] };
}
