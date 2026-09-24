import { posix } from 'node:path';

/**
 * What a Rust file says of the modules it is made of and the code it uses,
 * read from its tree. Resolution waits for every file and every Cargo
 * manifest (core/rust-modules.js), so each fact here is only what the file
 * itself spells:
 *
 * - `mod name;` declares a module whose file sits beside this one, or where
 *   a #[path] attribute says; a `mod name { ... }` block is a module inside
 *   this file, and what it declares is scoped to it.
 * - `use a::b::{c, d as e, f::*}` names one path per leaf.
 * - `extern crate name;` names a crate.
 * - A path spelled in code, crate::state::load() or engine::run(), names the
 *   module it calls into; it is kept only if it resolves to a file of this
 *   repository, since most such paths name a type (Vec::new) or another crate.
 *
 * Each is an import site carrying `rust`, which resolution reads and drops.
 */

const ITEMS = new Set(['enum_item', 'struct_item', 'union_item', 'trait_item', 'type_item', 'function_item', 'const_item', 'static_item', 'macro_definition']);
// The macros that read a file at compile time, and what each reads it as.
const INCLUDES = new Set(['include', 'include_str', 'include_bytes']);

/**
 * @param {object} root tree-sitter root node
 * @returns {{ imports: object[], module: { inline: string[][], names: string[] }, includes: Array<{ call: string, text: string, anchor: 'file'|'crate', line: number }> }}
 */
export function rustImports(root) {
  const imports = [];
  const inline = [];
  const names = new Set();
  const includes = [];
  const expressions = new Map();
  const visit = (node, scope) => {
    if (node.type === 'mod_item') {
      const name = node.childForFieldName('name')?.text;
      const body = node.childForFieldName('body');
      if (!name) return;
      if (body) {
        inline.push([...scope, name]);
        for (const child of body.namedChildren) visit(child, [...scope, name]);
        return;
      }
      const attributes = attributesOf(node);
      const site = { specifier: `mod ${[...scope, name].join('::')}`, kind: 'static', line: lineOf(node), rust: { mod: name, scope } };
      if (attributes.path) site.rust.path = attributes.path;
      if (attributes.test) site.rust.test = true;
      imports.push(site);
      return;
    }
    if (node.type === 'use_declaration') {
      for (const leaf of useLeaves(node.childForFieldName('argument'), [])) {
        const segments = leaf.segments[leaf.segments.length - 1] === 'self' ? leaf.segments.slice(0, -1) : leaf.segments;
        if (segments.length === 0) continue;
        const bound = leaf.alias ?? (leaf.glob ? null : segments[segments.length - 1]);
        if (bound && bound !== '_') names.add(bound);
        imports.push({
          specifier: `${segments.join('::')}${leaf.glob ? '::*' : ''}`,
          kind: 'static',
          line: lineOf(node),
          rust: { use: segments, scope, ...(leaf.alias ? { alias: leaf.alias } : {}), ...(leaf.glob ? { glob: true } : {}) },
        });
      }
      return;
    }
    if (node.type === 'extern_crate_declaration') {
      const name = node.childForFieldName('name')?.text;
      if (!name) return;
      const alias = node.childForFieldName('alias')?.text;
      if (alias) names.add(alias);
      imports.push({ specifier: `extern crate ${name}`, kind: 'static', line: lineOf(node), rust: { use: [name], scope, crate: true } });
      return;
    }
    if (ITEMS.has(node.type)) {
      const name = node.childForFieldName('name')?.text;
      if (name) names.add(name);
    }
    if (node.type === 'macro_invocation') {
      const macro = node.childForFieldName('macro');
      if (macro?.type === 'identifier' && INCLUDES.has(macro.text)) {
        const read = includedPath(node.namedChildren.find((child) => child.type === 'token_tree'));
        if (read) includes.push({ call: macro.text, ...read, line: lineOf(node) });
      }
      if (macro?.type === 'scoped_identifier') expressionSite(macro, scope, expressions);
    }
    if (node.type === 'call_expression') {
      const fn = node.childForFieldName('function');
      if (fn?.type === 'scoped_identifier') expressionSite(fn, scope, expressions);
    }
    if (node.type === 'scoped_type_identifier') expressionSite(node, scope, expressions);
    if (node.type === 'token_tree') for (const segments of tokenPaths(node)) segmentSite(segments, node, scope, expressions);
    for (const child of node.namedChildren) visit(child, scope);
  };
  for (const child of root.namedChildren) visit(child, []);
  imports.push(...expressions.values());
  return { imports, module: { inline, names: [...names].sort() }, includes };
}

// A path spelled in code names the module it goes through: every segment
// but the last, which is the function, type or macro. One segment names
// nothing past what is in scope, so it is no site; each module a file
// names this way is one site, at the line it is first named.
function expressionSite(node, scope, expressions) {
  const segments = pathSegments(node.childForFieldName('path'));
  if (segments != null) segmentSite(segments, node, scope, expressions);
}

function segmentSite(segments, node, scope, expressions) {
  if (segments.length === 0 || segments.includes('Self')) return;
  const key = `${scope.join('::')}\0${segments.join('::')}`;
  if (expressions.has(key)) return;
  expressions.set(key, { specifier: segments.join('::'), kind: 'static', line: lineOf(node), rust: { use: segments, scope, expression: true } });
}

// A macro's arguments are tokens the grammar leaves unparsed, so a path in
// them (println!("{}", crate::a::name()), generate_handler![app::commands::
// create]) is read from the tokens: each run of names joined by ::, as the
// module path it goes through, every name but the last.
function tokenPaths(tree) {
  const out = [];
  let run = [];
  let joined = false;
  const end = () => {
    if (run.length >= 2) out.push(run.slice(0, -1));
    run = [];
    joined = false;
  };
  for (let i = 0; i < tree.childCount; i += 1) {
    const token = tree.child(i);
    if (token.type === '::') {
      if (run.length === 0) run.push('');
      joined = true;
      continue;
    }
    if (token.type === 'identifier' || token.type === 'crate' || token.type === 'self' || token.type === 'super') {
      if (run.length > 0 && !joined) end();
      run.push(token.text);
      joined = false;
      continue;
    }
    end();
  }
  end();
  return out;
}

/**
 * The segments a path spells: crate::a::b is ['crate', 'a', 'b'], and
 * ::std::io, rooted at the extern prelude, is ['', 'std', 'io']. null for a
 * path with generic arguments or anything else a module path cannot hold.
 */
export function pathSegments(node) {
  if (!node) return null;
  if (node.type === 'identifier' || node.type === 'crate' || node.type === 'self' || node.type === 'super') return [node.text];
  if (node.type !== 'scoped_identifier') return null;
  const name = node.childForFieldName('name');
  if (name?.type !== 'identifier' && name?.type !== 'super' && name?.type !== 'self') return null;
  const path = node.childForFieldName('path');
  if (!path) return ['', name.text];
  const head = pathSegments(path);
  return head == null ? null : [...head, name.text];
}

// The leaves of a use tree, each with the path it spells from the root of
// the declaration: use a::{b, c::d as e, f::*} is a::b, a::c::d as e and
// the glob a::f::*.
function useLeaves(node, prefix) {
  if (!node) return [];
  switch (node.type) {
    case 'identifier':
    case 'crate':
    case 'self':
    case 'super':
    case 'scoped_identifier': {
      const segments = pathSegments(node);
      return segments ? [{ segments: [...prefix, ...segments] }] : [];
    }
    case 'use_as_clause': {
      const segments = pathSegments(node.childForFieldName('path'));
      const alias = node.childForFieldName('alias')?.text;
      return segments ? [{ segments: [...prefix, ...segments], ...(alias ? { alias } : {}) }] : [];
    }
    case 'use_wildcard': {
      const inner = node.namedChildren[0];
      const segments = inner ? pathSegments(inner) : [];
      return segments ? [{ segments: [...prefix, ...segments], glob: true }] : [];
    }
    case 'use_list':
      return node.namedChildren.flatMap((child) => useLeaves(child, prefix));
    case 'scoped_use_list': {
      const path = node.childForFieldName('path');
      const head = path ? pathSegments(path) : [];
      if (head == null) return [];
      return useLeaves(node.childForFieldName('list'), [...prefix, ...head]);
    }
    default:
      return [];
  }
}

// The #[path = "..."] and #[cfg(test)] attributes written before an item.
function attributesOf(node) {
  const out = {};
  for (let sibling = node.previousNamedSibling; sibling?.type === 'attribute_item' || sibling?.type === 'line_comment' || sibling?.type === 'block_comment'; sibling = sibling.previousNamedSibling) {
    if (sibling.type !== 'attribute_item') continue;
    const attribute = sibling.namedChildren.find((child) => child.type === 'attribute');
    const name = attribute?.namedChildren[0]?.text;
    if (name === 'path') {
      const value = attribute.childForFieldName('value');
      const text = value?.type === 'string_literal' ? stringText(value) : null;
      if (text != null) out.path = text;
    }
    if (name === 'cfg' && /^\(\s*test\s*\)$/.test(attribute.childForFieldName('arguments')?.text ?? '')) out.test = true;
  }
  return out;
}

/**
 * What an include macro's argument names: a literal, relative to the file
 * it is written in, or concat!(env!("CARGO_MANIFEST_DIR"), "/x"), relative
 * to the crate's directory. null for any other argument.
 */
function includedPath(tree) {
  const children = tree?.namedChildren ?? [];
  if (children.length === 1 && children[0].type === 'string_literal') {
    const text = stringText(children[0]);
    return text == null ? null : { text, anchor: 'file' };
  }
  if (children.length === 2 && children[0].type === 'identifier' && children[0].text === 'concat' && children[1].type === 'token_tree') {
    const parts = children[1].namedChildren;
    let anchor = 'file';
    let text = '';
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part.type === 'identifier' && part.text === 'env' && parts[i + 1]?.type === 'token_tree' && i === 0) {
        const variable = parts[i + 1].namedChildren[0];
        if (variable?.type !== 'string_literal' || stringText(variable) !== 'CARGO_MANIFEST_DIR') return null;
        anchor = 'crate';
        i += 1;
      } else if (part.type === 'string_literal') {
        const piece = stringText(part);
        if (piece == null) return null;
        text += piece;
      } else return null;
    }
    return { text: anchor === 'crate' ? text.replace(/^\/+/, '') : text, anchor };
  }
  return null;
}

/**
 * A string literal's text, escapes read; null for one with an escape this
 * reader does not spell out.
 */
export function stringText(node) {
  if (node?.type !== 'string_literal' && node?.type !== 'raw_string_literal') return null;
  let out = '';
  for (const child of node.namedChildren) {
    if (child.type === 'string_content') out += child.text;
    else if (child.type === 'escape_sequence') {
      const escaped = { '\\\\': '\\', '\\"': '"', "\\'": "'", '\\n': '\n', '\\t': '\t', '\\r': '\r', '\\0': '\0' }[child.text];
      if (escaped == null) return null;
      out += escaped;
    } else return null;
  }
  return out;
}

/**
 * The place an include names, from the file it is written in or from its
 * crate's directory, or null when it names no tracked file.
 *
 * @param {{ text: string, anchor: 'file'|'crate' }} include
 * @param {string} path the including file
 * @param {string | null} crateDir
 * @param {{ files: Set<string> }} places
 */
export function includedPlace(include, path, crateDir, places) {
  const base = include.anchor === 'crate' ? crateDir : posix.dirname(path) === '.' ? '' : posix.dirname(path);
  if (base == null) return null;
  const joined = posix.normalize(base ? `${base}/${include.text}` : include.text);
  if (joined === '..' || joined.startsWith('../') || joined.startsWith('/')) return null;
  return places.files.has(joined) ? joined : null;
}

function lineOf(node) {
  return node.startPosition.row + 1;
}
