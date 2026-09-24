import { posix } from 'node:path';
import { placeLandings, whereSet } from './landings.js';

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
 * @returns {{ imports: object[], module: { inline: string[][], names: string[] }, includes: Array<{ call: string, text: string, anchor: 'file'|'crate', line: number }>, tests: boolean }}
 *   tests is whether the file holds a #[test] function or a #[cfg(test)] module
 */
export function rustImports(root) {
  const imports = [];
  const inline = [];
  const names = new Set();
  const includes = [];
  const expressions = new Map();
  let tests = false;
  const visit = (node, scope) => {
    if (node.type === 'attribute_item' && testAttribute(node)) tests = true;
    if (node.type === 'mod_item') {
      const name = node.childForFieldName('name')?.text;
      const body = node.childForFieldName('body');
      if (!name) return;
      if (body) {
        if (attributesOf(node).test) tests = true;
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
  return { imports, module: { inline, names: [...names].sort() }, includes, tests };
}

// The std::fs calls that write or read a path, by the argument that is the
// path: fs::copy reads its first and writes its second.
const FS_CALLS = {
  write: [['write', 0]],
  create_dir_all: [['write', 0]],
  create_dir: [['write', 0]],
  copy: [['read', 0], ['write', 1]],
  rename: [['write', 1]],
  read_to_string: [['read', 0]],
  read: [['read', 0]],
  read_dir: [['read', 0]],
};
const FILE_CALLS = { create: 'write', open: 'read', create_new: 'write' };
// A place the caller decides, by the function that returns it.
const HOME_CALLS = new Set(['home_dir', 'data_dir', 'data_local_dir', 'config_dir', 'config_local_dir', 'cache_dir', 'document_dir', 'download_dir', 'desktop_dir', 'state_dir', 'runtime_dir', 'executable_dir', 'audio_dir', 'picture_dir', 'video_dir']);
const PASS_THROUGH = new Set(['unwrap', 'expect', 'unwrap_or_default', 'to_path_buf', 'to_owned', 'clone', 'as_path', 'into', 'as_ref', 'canonicalize', 'to_string', 'as_str']);
// The directories Tauri's path resolver (app.path(), or app_handle.path())
// names for the app on the person's machine.
const TAURI_DIRS = new Set(['app_data_dir', 'app_config_dir', 'app_local_data_dir', 'app_cache_dir', 'app_log_dir']);
// The functions clap and argh parse the command line with; what they return
// holds the arguments.
const ARGUMENT_CALLS = new Set(['parse', 'parse_from', 'try_parse', 'try_parse_from', 'from_env', 'from_args']);
const MAX_DEPTH = 8;

/**
 * The writes and reads a Rust file makes through std::fs and File, each
 * with what its path reads as: a literal, a Path or PathBuf built from
 * one, joined with .join, a crate's own directory (env!("CARGO_MANIFEST_DIR")),
 * or a place the caller decides: the working directory, the home directory
 * or one of the directories the dirs crate names, the temporary directory,
 * an environment variable, a command-line argument clap or argh parses, or a
 * parameter of the function the call is in. A value followed through a let
 * in the same function, or a const or static of the file. Code inside a
 * #[cfg(test)] module or a #[test] function writes into what its test sets
 * up, and is left out. Settled once the crates are known (settleRustPaths).
 *
 * @param {object} root tree-sitter root node
 * @returns {Array<{ kind: 'write'|'read', call: string, values: object[] }>}
 */
export function rustPaths(root) {
  const out = [];
  const consts = new Map();
  for (const child of root.namedChildren) {
    if ((child.type === 'const_item' || child.type === 'static_item') && child.childForFieldName('name')) consts.set(child.childForFieldName('name').text, child.childForFieldName('value'));
  }
  const visit = (node) => {
    if (node.type === 'mod_item' && attributesOf(node).test) return;
    if (node.type === 'function_item' && hasTestAttribute(node)) return;
    if (node.type === 'call_expression') {
      for (const [kind, call, arg] of fsSites(node)) {
        out.push({ kind, call, values: arg ? rustValues(arg, { consts }, 0) : [] });
      }
      // tauri-build, which a Tauri crate's build script runs on every build
      // of the crate, writes the capability schemas under the crate's gen/.
      const called = pathSegments(node.childForFieldName('function'))?.join('::');
      if (called === 'tauri_build::build' || called === 'tauri_build::try_build') out.push({ kind: 'write', call: called, values: [{ text: 'gen/schemas', open: false, anchor: 'crate' }] });
    }
    for (const child of node.namedChildren) visit(child);
  };
  visit(root);
  return out;
}

function hasTestAttribute(node) {
  for (let sibling = node.previousNamedSibling; sibling?.type === 'attribute_item' || /comment$/.test(sibling?.type ?? ''); sibling = sibling.previousNamedSibling) {
    if (sibling.type === 'attribute_item' && testAttribute(sibling)) return true;
  }
  return false;
}

// The paths one call writes or reads: fs::write(p, ...), File::create(p),
// OpenOptions::new().write(true).open(p), which writes when the options
// write, append, create or truncate, and reads otherwise.
function fsSites(call) {
  const fn = call.childForFieldName('function');
  const args = (call.childForFieldName('arguments')?.namedChildren ?? []).filter((child) => !/comment$/.test(child.type));
  if (fn?.type === 'scoped_identifier') {
    const segments = pathSegments(fn);
    if (segments == null || segments.length < 2) return [];
    const [owner, name] = segments.slice(-2);
    if (owner === 'fs' && FS_CALLS[name]) return FS_CALLS[name].map(([kind, index]) => [kind, name, args[index] ?? null]);
    if (owner === 'File' && FILE_CALLS[name]) return [[FILE_CALLS[name], name, args[0] ?? null]];
    return [];
  }
  if (fn?.type === 'field_expression' && fn.childForFieldName('field')?.text === 'open') {
    const options = [];
    let at = fn.childForFieldName('value');
    while (at?.type === 'call_expression' && at.childForFieldName('function')?.type === 'field_expression') {
      options.push(at.childForFieldName('function').childForFieldName('field')?.text);
      at = at.childForFieldName('function').childForFieldName('value');
    }
    const opened = at?.type === 'call_expression' && pathSegments(at.childForFieldName('function'))?.slice(-2).join('::') === 'OpenOptions::new';
    if (!opened) return [];
    const writes = options.some((option) => ['write', 'append', 'create', 'create_new', 'truncate'].includes(option));
    return [[writes ? 'write' : 'read', 'open', args[0] ?? null]];
  }
  return [];
}

/**
 * What a Rust expression names as a path, each alternative as
 * { text, open, anchor? }: anchor crate for the crate's directory, and cwd,
 * home, temp, env, argument or param for a place the caller decides.
 */
function rustValues(node, ctx, depth) {
  if (!node || depth > MAX_DEPTH) return [];
  switch (node.type) {
    case 'string_literal':
    case 'raw_string_literal': {
      const text = stringText(node);
      return text == null ? [] : [{ text, open: false }];
    }
    case 'reference_expression':
    case 'parenthesized_expression':
    case 'try_expression':
      return rustValues(node.childForFieldName('value') ?? node.namedChildren[node.namedChildren.length - 1], ctx, depth + 1);
    case 'identifier':
      return bindingValues(node, ctx, depth);
    case 'field_expression': {
      // self.save_dir, a field of the value a method is called on, is what
      // the constructors that build it set it to (settleRustPaths).
      const object = node.childForFieldName('value');
      const name = node.childForFieldName('field')?.text;
      if (object?.type === 'self' && name) {
        const type = implTypeOf(node);
        return type ? [{ text: '', open: false, anchor: 'field', field: { type, name } }] : [];
      }
      // args.out, a field of what clap or argh parsed.
      const values = rustValues(object, ctx, depth + 1);
      return values.filter((value) => value.anchor === 'argument').map(() => ({ text: '', open: false, anchor: 'argument' }));
    }
    case 'macro_invocation':
      return macroValues(node, ctx, depth);
    case 'call_expression':
      return callValues(node, ctx, depth);
    default:
      return [];
  }
}

function callValues(node, ctx, depth) {
  const fn = node.childForFieldName('function');
  const args = (node.childForFieldName('arguments')?.namedChildren ?? []).filter((child) => !/comment$/.test(child.type));
  if (fn?.type === 'field_expression') {
    const method = fn.childForFieldName('field')?.text;
    const receiver = fn.childForFieldName('value');
    if (PASS_THROUGH.has(method) || method === 'unwrap_or_else' || method === 'unwrap_or') return rustValues(receiver, ctx, depth + 1);
    if (method === 'join' || method === 'push') return joinValues(rustValues(receiver, ctx, depth + 1), rustValues(args[0], ctx, depth + 1));
    // The directory above a caller's place is the caller's; above a literal
    // it names nothing this reader follows.
    if (method === 'parent') return rustValues(receiver, ctx, depth + 1).filter((value) => CALLER_PLACES.has(value.anchor)).map((value) => ({ ...value, text: '', open: false }));
    if (TAURI_DIRS.has(method)) return [{ text: '', open: false, anchor: 'home' }];
    return [];
  }
  const segments = pathSegments(fn);
  if (segments == null) return [];
  const [owner, name] = segments.length >= 2 ? segments.slice(-2) : [null, segments[0]];
  if ((owner === 'Path' || owner === 'PathBuf') && (name === 'new' || name === 'from')) return rustValues(args[0], ctx, depth + 1);
  if (owner === 'env' && name === 'current_dir') return [{ text: '', open: false, anchor: 'cwd' }];
  if (owner === 'env' && name === 'temp_dir') return [{ text: '', open: false, anchor: 'temp' }];
  if (owner === 'env' && (name === 'var' || name === 'var_os')) return [{ text: '', open: false, anchor: 'env' }];
  if (['dirs', 'dirs_next', 'home', 'directories'].includes(owner) && HOME_CALLS.has(name)) return [{ text: '', open: false, anchor: 'home' }];
  if (segments.length >= 2 && ARGUMENT_CALLS.has(name) && (owner === 'argh' || /^[A-Z]/.test(owner))) return [{ text: '', open: false, anchor: 'argument' }];
  return [];
}

function macroValues(node, ctx, depth) {
  const name = node.childForFieldName('macro')?.text;
  const tree = node.namedChildren.find((child) => child.type === 'token_tree');
  const parts = tree?.namedChildren ?? [];
  if (name === 'env' && parts.length === 1 && parts[0].type === 'string_literal' && stringText(parts[0]) === 'CARGO_MANIFEST_DIR') return [{ text: '', open: false, anchor: 'crate' }];
  if (name === 'concat') {
    const included = includedPath(tree);
    return included ? [{ text: included.text, open: false, ...(included.anchor === 'crate' ? { anchor: 'crate' } : {}) }] : [];
  }
  // format!("assets/{}.json", name) spells a path whose end is read at run
  // time; the literal before the first {} is where it is.
  if (name === 'format' && parts[0]?.type === 'string_literal') {
    const text = stringText(parts[0]);
    if (text == null) return [];
    const at = text.indexOf('{');
    return at === -1 ? [{ text, open: false }] : at === 0 ? [] : [{ text: text.slice(0, at), open: true }];
  }
  return [];
}

// A name bound by a let before the use in the same function, a parameter of
// that function, or a const or static of the file.
function bindingValues(node, ctx, depth) {
  const name = node.text;
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (scope.type === 'block') {
      let found = null;
      for (const statement of scope.namedChildren) {
        if (statement.startIndex >= node.startIndex) break;
        if (statement.type !== 'let_declaration') continue;
        const pattern = statement.childForFieldName('pattern');
        if (pattern?.type === 'identifier' && pattern.text === name) found = statement.childForFieldName('value');
      }
      if (found) return rustValues(found, ctx, depth + 1);
    }
    if (scope.type === 'function_item' || scope.type === 'closure_expression') {
      const params = scope.childForFieldName('parameters');
      const bound = (params?.namedChildren ?? []).some((param) => param.childForFieldName('pattern')?.text === name || param.text === name);
      if (bound) {
        // A parameter of a function calls can be followed to: which one it
        // is, for settleRustPaths.
        const key = scope.type === 'function_item' ? functionKey(scope) : null;
        const index = (params?.namedChildren ?? []).filter((param) => param.type === 'parameter').findIndex((param) => param.childForFieldName('pattern')?.text === name);
        return [{ text: '', open: false, anchor: 'param', ...(key != null && index !== -1 ? { param: { fn: key, index } } : {}) }];
      }
      if (scope.type === 'function_item') break;
    }
  }
  const value = ctx.consts.get(name);
  return value ? rustValues(value, ctx, depth + 1) : [];
}

function joinValues(bases, parts) {
  const out = [];
  for (const base of bases) {
    if (parts.length === 0) {
      out.push({ ...base, text: base.text === '' ? '' : `${base.text.replace(/\/+$/, '')}/`, open: true });
      continue;
    }
    for (const part of parts) {
      if (base.open) out.push(base);
      else if (part.anchor != null || part.text.startsWith('/')) out.push(part);
      else out.push({ ...base, text: base.text === '' ? part.text : `${base.text.replace(/\/+$/, '')}/${part.text}`, open: part.open });
    }
  }
  return out;
}

// #[test], and a test attribute a runtime provides (#[tokio::test]): the
// function is one cargo test runs.
function testAttribute(node) {
  const name = node.namedChildren.find((child) => child.type === 'attribute')?.namedChildren[0];
  return name != null && (name.text === 'test' || name.text.endsWith('::test'));
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

const CONDITION_SHOWN = 60;

/**
 * The first pass of the order of work (core/sequence.js), for Rust: each
 * function of the file's own module, with the calls its body makes as the
 * binding each goes through. A call to a function of this module is local;
 * one through a name a use brings in (draw(), Engine::new(),
 * engine::run()), a module the file declares (config::load()) or a path
 * spelled from a crate (crate::telemetry::record()) goes through that import
 * site. A method on a value names nothing the reader can follow. fn main is
 * what the program runs, so it is the one invoked; a library's entry is
 * chosen from what it exports, as for the other languages. Test code is
 * left out, and so is what a macro's arguments call, which the grammar
 * leaves as tokens.
 *
 * @param {object} root tree-sitter root node
 * @param {object[]} imports the sites rustImports read from the same tree
 */
export function rustSequence(root, imports) {
  const top = imports.filter((site) => site.rust && site.rust.scope.length === 0);
  const bound = new Map();
  for (const site of top) {
    if (!site.rust.use || site.rust.expression || site.rust.crate || site.rust.glob) continue;
    const name = site.rust.alias ?? site.rust.use[site.rust.use.length - 1];
    if (!bound.has(name)) bound.set(name, site);
  }
  const mods = new Map(top.filter((site) => site.rust.mod).map((site) => [site.rust.mod, site]));
  const expressions = new Map(top.filter((site) => site.rust.expression).map((site) => [site.specifier, site]));
  const moduleFunctions = root.namedChildren.filter((child) => child.type === 'function_item' && !hasTestAttribute(child) && child.childForFieldName('name'));
  const byName = new Map(moduleFunctions.map((fn) => [fn.childForFieldName('name').text, fn]));
  const siteOf = (module) => {
    const spelled = expressions.get(module.join('::'));
    if (module.length > 1) return spelled ?? bound.get(module[0]) ?? null;
    return bound.get(module[0]) ?? spelled ?? mods.get(module[0]) ?? null;
  };
  const classify = (call) => {
    const fn = call.childForFieldName('function');
    const line = call.startPosition.row + 1;
    if (fn?.type === 'identifier') {
      if (byName.has(fn.text)) return { kind: 'local', node: byName.get(fn.text), name: fn.text, line };
      const site = bound.get(fn.text);
      return site ? { kind: 'import', name: fn.text, site: { specifier: site.specifier, line: site.line }, line } : null;
    }
    if (fn?.type !== 'scoped_identifier') return null;
    const segments = pathSegments(fn);
    if (segments == null || segments.length < 2 || segments.includes('Self') || segments[0] === '') return null;
    const module = segments.slice(0, -1);
    const site = siteOf(module);
    if (!site) return null;
    // Engine::new() is work in the file that defines the type.
    const receiver = module.length === 1 && bound.has(module[0]) && /^[A-Z]/.test(module[0]) ? { receiver: module[0] } : {};
    return { kind: 'import', name: segments[segments.length - 1], site: { specifier: site.specifier, line: site.line }, line, ...receiver };
  };
  const visit = (node, steps) => {
    if (!node) return;
    if (['function_item', 'mod_item', 'impl_item', 'trait_item', 'macro_invocation'].includes(node.type)) return;
    if (node.type === 'if_expression' && earlyReturn(node)) {
      const condition = node.childForFieldName('condition');
      visit(condition, steps);
      const inner = [];
      visit(node.childForFieldName('consequence'), inner);
      for (const step of inner) steps.push({ ...step, branch: step.branch ?? conditionText(condition) });
      return;
    }
    if (node.type === 'call_expression') {
      const fn = node.childForFieldName('function');
      if (fn && fn.type !== 'identifier' && fn.type !== 'scoped_identifier') visit(fn, steps);
      for (const arg of node.childForFieldName('arguments')?.namedChildren ?? []) if (arg.type !== 'closure_expression') visit(arg, steps);
      const step = classify(node);
      if (step) steps.push(step);
      for (const arg of node.childForFieldName('arguments')?.namedChildren ?? []) if (arg.type === 'closure_expression') visit(arg.childForFieldName('body'), steps);
      return;
    }
    for (const child of node.namedChildren) visit(child, steps);
  };
  const plain = (step) => {
    const branch = step.branch ? { branch: step.branch } : {};
    if (step.kind === 'local') return { kind: 'local', fn: step.node.startIndex, line: step.line, ...branch };
    return { kind: step.kind, name: step.name, line: step.line, site: step.site, ...(step.receiver ? { receiver: step.receiver } : {}), ...branch };
  };
  const functions = moduleFunctions.map((fn) => {
    const steps = [];
    visit(fn.childForFieldName('body'), steps);
    return {
      id: fn.startIndex,
      name: fn.childForFieldName('name').text,
      line: fn.startPosition.row + 1,
      moduleLevel: true,
      exported: fn.namedChildren.some((child) => child.type === 'visibility_modifier'),
      isDefaultExport: false,
      steps: steps.map(plain),
    };
  });
  const main = moduleFunctions.find((fn) => fn.childForFieldName('name').text === 'main');
  return { functions, topLevel: main ? [main.startIndex] : [], reexports: [] };
}

// if cond { ...; return; } with no else: the other way the function goes.
function earlyReturn(node) {
  if (node.childForFieldName('alternative')) return false;
  const block = node.childForFieldName('consequence');
  const last = block?.namedChildren.filter((child) => !/comment$/.test(child.type)).at(-1);
  const expression = last?.type === 'expression_statement' ? last.namedChildren[0] : last;
  return expression?.type === 'return_expression';
}

function conditionText(node) {
  const text = (node?.text ?? '').replace(/\s+/g, ' ').trim();
  return text.length > CONDITION_SHOWN ? `${text.slice(0, CONDITION_SHOWN - 1)}…` : text;
}

// The places a caller decides, which a write or read under them names.
const CALLER_PLACES = new Set(['cwd', 'home', 'temp', 'env', 'argument', 'param', 'field']);

// The type an impl block is for, of the item a node is in; null outside one.
function implTypeOf(node) {
  for (let at = node.parent; at; at = at.parent) {
    if (at.type === 'impl_item') {
      const type = at.childForFieldName('type');
      const named = type?.type === 'generic_type' ? type.childForFieldName('type') : type;
      return named?.type === 'type_identifier' ? named.text : null;
    }
    if (at.type === 'mod_item') return null;
  }
  return null;
}

// How calls name a function of the file's own module: name for a free
// function, Type::name for one of an impl block; null for one in an inline
// module, which this reader does not follow calls into.
function functionKey(fn) {
  const name = fn.childForFieldName('name')?.text;
  if (!name) return null;
  const parent = fn.parent;
  if (parent?.type === 'source_file') return name;
  if (parent?.type === 'declaration_list' && parent.parent?.type === 'impl_item' && parent.parent.parent?.type === 'source_file') {
    const type = implTypeOf(fn);
    return type ? `${type}::${name}` : null;
  }
  return null;
}

/**
 * The calls a Rust file makes by path (load(), Store::new(), crate::a::b()),
 * with what each argument reads as a path, and the values each struct
 * literal sets a field to (Store { save_dir: dir }), for settleRustPaths to
 * follow a parameter-rooted or field-rooted path back to what it is. A
 * method called on a value names nothing this reader can resolve. Test code
 * is left out, as rustPaths leaves it.
 *
 * @param {object} root tree-sitter root node
 * @returns {{ calls: object[], fields: object[] }}
 */
export function rustCalls(root) {
  const consts = new Map();
  for (const child of root.namedChildren) {
    if ((child.type === 'const_item' || child.type === 'static_item') && child.childForFieldName('name')) consts.set(child.childForFieldName('name').text, child.childForFieldName('value'));
  }
  const calls = [];
  const fields = [];
  const visit = (node) => {
    if (node.type === 'mod_item' && attributesOf(node).test) return;
    if (node.type === 'function_item' && hasTestAttribute(node)) return;
    if (node.type === 'call_expression') {
      const segments = pathSegments(node.childForFieldName('function'));
      const args = (node.childForFieldName('arguments')?.namedChildren ?? []).filter((child) => !/comment$/.test(child.type));
      const values = args.map((arg) => rustValues(arg, { consts }, 0));
      if (segments != null && segments[0] !== '' && values.some((list) => list.length > 0)) calls.push({ segments, args: values, ...(implTypeOf(node) ? { self: implTypeOf(node) } : {}) });
    }
    if (node.type === 'struct_expression') {
      const name = node.childForFieldName('name');
      const type = name?.text === 'Self' ? implTypeOf(node) : name?.type === 'type_identifier' ? name.text : null;
      for (const init of type ? node.childForFieldName('body')?.namedChildren ?? [] : []) {
        const field = init.type === 'field_initializer' ? init.childForFieldName('field')?.text : init.type === 'shorthand_field_initializer' ? init.namedChildren[0]?.text : null;
        const value = init.type === 'field_initializer' ? init.childForFieldName('value') : init.type === 'shorthand_field_initializer' ? init.namedChildren[0] : null;
        if (field && value) fields.push({ type, field, values: rustValues(value, { consts }, 0) });
      }
    }
    for (const child of node.namedChildren) visit(child);
  };
  visit(root);
  return { calls, fields };
}

/**
 * The writes and reads each Rust file's include macros and std::fs calls
 * name, placed now that each file's crate is known: an include from the
 * file it is written in, env!("CARGO_MANIFEST_DIR") from the crate's
 * directory, both fixed to this repository; a bare relative path from where
 * the program runs; a place the caller decides counted apart, as outside.
 * Drops what the readings carried for this.
 *
 * @param {{ files: object[], places: { files: Set<string>, dirs: Set<string> }, crateDirOf: (path: string) => string | null }} input
 */
export function settleRustPaths({ files, places, crateDirOf, isTest = () => false }) {
  const follow = followRust(files.filter((file) => file.language === 'rust' && !file.parseError), isTest);
  for (const file of files) {
    if (file.language !== 'rust' || file.parseError) continue;
    const dir = posix.dirname(file.path) === '.' ? '' : posix.dirname(file.path);
    const crateDir = crateDirOf(file.path);
    const fixed = (base, text) => {
      if (base == null) return null;
      const joined = posix.normalize(base ? `${base}/${text}` : text);
      return joined === '..' || joined.startsWith('../') || joined.startsWith('/') ? null : { text: joined, open: false, anchor: 'file' };
    };
    const sites = [];
    for (const include of file.rustIncludes ?? []) {
      const value = fixed(include.anchor === 'crate' ? crateDir : dir, include.text);
      sites.push({ kind: 'read', call: include.call, values: value ? [value] : [] });
    }
    for (const site of file.rustPaths ?? []) {
      const theirs = site.values.filter((value) => CALLER_PLACES.has(value.anchor));
      if (theirs.length > 0) {
        // A parameter or a field is followed to what the calls and the
        // constructors here hand it: the caller's place, where that is said;
        // a path of this repository, which is placed; or nothing this reader
        // follows, a path built at run time.
        const found = { where: new Set(), places: [], unread: false, call: site.call };
        for (const value of theirs) follow(file.path, value, 0, found);
        if (found.where.size > 0) {
          const count = site.kind === 'write' ? 'outsideWrites' : 'outsideReads';
          file[count] = (file[count] ?? 0) + 1;
          (file.outsideWhere ??= []).push({ kind: site.kind, where: [...found.where].sort() });
          continue;
        }
        sites.push({ kind: site.kind, call: site.call, values: found.places });
        continue;
      }
      const values = site.values.map((value) => (value.anchor === 'crate' ? (value.open ? { ...fixed(crateDir, value.text), open: true } : fixed(crateDir, value.text)) : value)).filter(Boolean);
      sites.push({ kind: site.kind, call: site.call, values });
    }
    delete file.rustIncludes;
    delete file.rustPaths;
    if (sites.length === 0) continue;
    const placed = placeLandings(file, sites, places);
    file.writes = placed.writes;
    file.reads = placed.reads;
    file.dynamicWrites = (file.dynamicWrites ?? 0) + placed.dynamicWrites;
    file.dynamicReads = (file.dynamicReads ?? 0) + placed.dynamicReads;
  }
}

// A parameter is followed back through at most this many calls, and a
// field through the constructors that set it, as the other languages'
// parameters are (landings.js settleParamPaths).
const FOLLOW_HOPS = 4;

/**
 * The follower settleRustPaths reads a caller's place with: for a value at
 * the working directory, the home directory, a temporary directory, an
 * environment variable or a command-line argument, where it goes; for a
 * parameter of a function this repository calls by path (load(),
 * Store::new(), crate::a::b()), what each call outside test code hands it;
 * for self.field, what each struct literal of the type in the same file
 * sets the field to, read where the literal is. A call no argument of which
 * the reader can read, and a function nothing here calls, is a path the
 * caller passes; a field no literal here sets is a path built at run time;
 * a literal a call hands over is a place of this repository, joined with the
 * rest of the path. Drops what the readings carried for this.
 */
function followRust(files, isTest) {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const callsTo = new Map();
  const inits = new Map();
  const push = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  for (const file of files) {
    for (const call of file.rustCalls?.calls ?? []) {
      if (isTest(file.path)) continue;
      const key = calleeOf(file, call);
      if (key) push(callsTo, key, { path: file.path, args: call.args });
    }
    for (const init of file.rustCalls?.fields ?? []) push(inits, `${file.path}#${init.type}.${init.field}`, init.values);
  }
  for (const file of files) {
    delete file.rustCalls;
  }
  const follow = (path, value, depth, found, seen = new Set()) => {
    if (['cwd', 'home', 'temp', 'env', 'argument'].includes(value.anchor)) {
      for (const key of whereSet([value], found.call ?? null)) found.where.add(key);
      return;
    }
    if (value.anchor !== 'param' && value.anchor !== 'field') {
      found.places.push(value);
      return;
    }
    const key = value.anchor === 'param' ? (value.param ? `${path}#${value.param.fn}` : null) : `${path}#${value.field.type}.${value.field.name}`;
    if (key == null || depth >= FOLLOW_HOPS || seen.has(key)) {
      if (value.anchor === 'field') found.unread = true;
      else found.where.add('caller');
      return;
    }
    const next = new Set([...seen, key]);
    if (value.anchor === 'field') {
      const sets = inits.get(key) ?? [];
      if (sets.length === 0) found.unread = true;
      for (const values of sets) {
        if (values.length === 0) found.unread = true;
        for (const root of values) follow(path, joinRest(root, value), depth + 1, found, next);
      }
      return;
    }
    const calls = callsTo.get(key) ?? [];
    if (calls.length === 0) found.where.add('caller');
    for (const call of calls) {
      const values = call.args[value.param.index] ?? [];
      if (values.length === 0) found.where.add('caller');
      for (const root of values) follow(call.path, joinRest(root, value), depth + 1, found, next);
    }
  };
  return (path, value, depth, found) => {
    if (byPath.has(path)) follow(path, value, depth, found);
    else found.where.add('caller');
  };
}

// A root a call or a constructor hands over, with the rest of the path the
// parameter or the field was joined with.
function joinRest(root, rest) {
  // A rest read wholly at run time (a name under the root) leaves the root a
  // directory, as a join with it does.
  if (rest.text === '') return rest.open && !root.open && root.text !== '' ? { ...root, text: `${root.text.replace(/\/+$/, '')}/`, open: true } : { ...root, open: root.open || rest.open };
  if (root.open) return root;
  return { ...root, text: root.text === '' ? rest.text : `${root.text.replace(/\/+$/, '')}/${rest.text}`, open: rest.open };
}

/**
 * The function a call by path names, as path#key: a free function by its
 * name, one of an impl block as Type::name; Self is the impl the call is in.
 * The path before the name resolves through what the file binds by use and
 * mod, the items it declares, and the module paths its code spells, which
 * resolution already placed. Null for a call this reader cannot place.
 */
function calleeOf(file, call) {
  const segments = call.segments;
  const name = segments[segments.length - 1];
  const prefix = segments.slice(0, -1);
  const owner = prefix[prefix.length - 1] ?? null;
  const local = new Set(file.rustNames ?? []);
  const bound = file.rustBound ?? {};
  const spelled = (parts) => {
    const site = Array.isArray(file.imports) ? file.imports.find((item) => item.specifier === parts.join('::') && item.resolved?.outcome === 'file') : null;
    return site?.resolved.path ?? null;
  };
  // A name a use or a mod binds is that file's; any other name the file
  // spells is an item of its own (rustNames holds both).
  if (owner == null) {
    if (bound[name]) return `${bound[name]}#${name}`;
    return local.has(name) ? `${file.path}#${name}` : null;
  }
  if (owner === 'Self') return call.self ? `${file.path}#${call.self}::${name}` : null;
  if (/^[A-Z]/.test(owner)) {
    const at = prefix.length === 1 ? (bound[owner] ?? (local.has(owner) ? file.path : null)) : spelled(prefix) ?? spelled(prefix.slice(0, -1));
    return at ? `${at}#${owner}::${name}` : null;
  }
  const at = prefix.length === 1 ? bound[owner] ?? null : spelled(prefix);
  return at ? `${at}#${name}` : null;
}

function lineOf(node) {
  return node.startPosition.row + 1;
}
