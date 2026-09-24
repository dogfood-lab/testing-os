import { posix } from 'node:path';
import { godotProjects, projectOf, resPath } from './godot.js';
import { placeLandings } from './landings.js';

/**
 * What a GDScript file, and a scene or resource Godot saves as text, says of
 * the scripts and resources it uses, read from its tree or its lines.
 * Resolution waits for every file and every project.godot
 * (resolveGodot), so each fact here is what the file itself spells:
 *
 * - `extends "res://path.gd"` and `preload("res://...")` of a script or a
 *   scene are imports; `load(...)` of one with a literal, or a const holding
 *   one, is an import resolved at run time (dynamic-literal), and so is
 *   change_scene_to_file. A scene is an import because instancing it runs
 *   the scripts it holds. Any other resource they name (a texture, a sound,
 *   a .tres of data) is read, not imported, and so is a res:// literal the
 *   code names.
 * - `extends Name` and every capitalized name the code uses may be a global
 *   class another file declares with class_name, or an autoload
 *   project.godot names; which it is waits for resolution, and a name that is
 *   neither (Node2D, Vector2) is no import at all.
 * - A scene's `[ext_resource path="res://..."]` lines are imports of the
 *   scripts and scenes it instances and reads of every other resource.
 */

const SCRIPT_KINDS = new Set(['.gd', '.tscn', '.scn']);
// The methods that switch the running scene to the one they are handed.
const SCENE_SWITCHES = new Set(['change_scene_to_file', 'change_scene']);
// What the engine calls on a script by itself, which is where the work in
// it starts: a node's callbacks, and a SceneTree script's _initialize.
const CALLBACKS = new Set(['_init', '_initialize', '_enter_tree', '_ready', '_process', '_physics_process', '_input', '_unhandled_input', '_run']);
const CONDITION_SHOWN = 60;

/**
 * @param {object} root tree-sitter root node
 * @returns {{ imports: object[], godot: object, sequence: object }}
 */
export function gdscriptReadings(root) {
  const imports = [];
  const loads = [];
  let dynamicReads = 0;
  const consts = new Map();
  const declared = new Set();
  for (const statement of root.namedChildren) {
    const name = statement.childForFieldName('name')?.text;
    if (name) declared.add(name);
    const value = statement.childForFieldName('value');
    if ((statement.type === 'const_statement' || statement.type === 'variable_statement') && name && value?.type === 'string') consts.set(name, value);
  }
  const consumed = new Set();
  const bound = new Map();
  const names = new Map();
  let extendsName = null;
  let className = null;
  const site = (text, kind, node, call) => {
    if (!text.startsWith('res://') && text.includes('://')) return;
    const extension = posix.extname(text).toLowerCase();
    if (SCRIPT_KINDS.has(extension)) {
      const entry = { specifier: text, kind, line: lineOf(node), godot: true };
      imports.push(entry);
      return entry;
    }
    loads.push({ text, call });
    return null;
  };
  const literal = (node) => {
    if (node?.type === 'string') {
      consumed.add(node.startIndex);
      return stringText(node);
    }
    if (node?.type === 'identifier' && consts.has(node.text)) {
      consumed.add(consts.get(node.text).startIndex);
      return stringText(consts.get(node.text));
    }
    return null;
  };
  const visit = (node) => {
    if (node.type === 'extends_statement') {
      const target = node.namedChildren[0];
      if (target?.type === 'string') site(literal(target), 'static', node, 'extends');
      else if (target?.type === 'type') {
        extendsName = target.text;
        if (!names.has(extendsName)) names.set(extendsName, lineOf(node));
      }
      return;
    }
    if (node.type === 'class_name_statement') className = node.childForFieldName('name')?.text ?? null;
    if (node.type === 'call' || node.type === 'attribute_call') {
      const callee = node.namedChildren[0];
      const args = node.childForFieldName('arguments')?.namedChildren ?? [];
      const loader = callee?.type === 'identifier' && (callee.text === 'preload' || callee.text === 'load');
      const resourceLoad = node.type === 'attribute_call' && callee?.text === 'load' && node.parent?.namedChildren[0]?.text === 'ResourceLoader';
      const switches = node.type === 'attribute_call' && SCENE_SWITCHES.has(callee?.text);
      if (loader || resourceLoad || switches) {
        const text = literal(args[0]);
        if (text == null) dynamicReads += 1;
        else {
          const entry = site(text, callee.text === 'preload' ? 'static' : 'dynamic-literal', node, callee.text);
          const holder = node.parent?.type === 'const_statement' || node.parent?.type === 'variable_statement' ? node.parent.childForFieldName('name')?.text : null;
          if (entry && holder && node.parent.parent?.type === 'source') bound.set(holder, entry);
        }
      }
    }
    if (node.type === 'identifier' && /^[A-Z]/.test(node.text) && !declared.has(node.text) && !names.has(node.text)) names.set(node.text, lineOf(node));
    for (const child of node.namedChildren) visit(child);
  };
  for (const child of root.namedChildren) visit(child);
  // A res:// path the code spells without loading it is still a place it
  // names, read when the value reaches something that opens it.
  walk(root, (node) => {
    if (node.type !== 'string' || consumed.has(node.startIndex)) return;
    const text = stringText(node);
    if (text?.startsWith('res://')) loads.push({ text, call: 'literal' });
  });
  return {
    imports,
    godot: {
      loads,
      dynamicReads,
      names: [...names.entries()].map(([name, line]) => ({ name, line })),
      ...(extendsName ? { extendsName } : {}),
      ...(className ? { className } : {}),
    },
    sequence: gdscriptSequence(root, bound, names),
  };
}

/**
 * What a scene or resource Godot saves as text says it uses: each
 * [ext_resource] with a path, an import of a script or scene it instances
 * and a read of any other resource.
 *
 * @param {string} text
 * @returns {{ imports: object[], godot: { loads: object[] } }}
 */
export function godotResourceReadings(text) {
  const imports = [];
  const loads = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!/^\[ext_resource\b/.test(line)) return;
    const path = /\bpath="([^"]*)"/.exec(line)?.[1];
    if (!path) return;
    const type = /\btype="([^"]*)"/.exec(line)?.[1] ?? '';
    const extension = posix.extname(path).toLowerCase();
    if (type === 'Script' || type === 'PackedScene' || SCRIPT_KINDS.has(extension)) imports.push({ specifier: path, kind: 'static', line: index + 1, godot: true });
    else loads.push({ text: path, call: 'ext_resource' });
  });
  return { imports, godot: { loads } };
}

/**
 * Resolve every GDScript, scene and resource file's import sites: a res://
 * path from its project's root, a relative one from the file's directory,
 * and each name the code uses that another file declares with class_name,
 * or that project.godot names as an autoload, as an import of that file (a
 * site `global:Name`, at the line it is first used). A name that is neither
 * is the engine's, and no site. Mutates the files; drops what the readings
 * carried for this, but the loads (settleGodotPaths).
 *
 * @param {{ repoPath: string, tracked: Set<string>, files: object[] }} input
 */
export function resolveGodot({ repoPath, tracked, files }) {
  const godot = files.filter((file) => file.godot && Array.isArray(file.imports));
  if (godot.length === 0) return;
  const projects = godotProjects(repoPath, tracked);
  const globals = new Map();
  for (const file of godot) {
    if (file.godot.className && !globals.has(file.godot.className)) globals.set(file.godot.className, file.path);
  }
  for (const project of projects) {
    for (const autoload of project.autoloads) if (!globals.has(autoload.name)) globals.set(autoload.name, autoload.path);
  }
  for (const file of godot) {
    const project = projectOf(projects, file.path);
    for (const entry of file.imports) {
      if (!entry.godot) continue;
      const path = godotPath(project, file.path, entry.specifier, tracked);
      entry.resolved = path ? { outcome: 'file', path } : { outcome: 'unresolved', reason: 'godot-resource-not-found' };
      delete entry.godot;
    }
    for (const { name, line } of file.godot.names ?? []) {
      const path = globals.get(name);
      if (path && path !== file.path) file.imports.push({ specifier: `global:${name}`, kind: 'static', line, resolved: { outcome: 'file', path } });
    }
  }
}

/**
 * The reads a GDScript file's loads and literals name, and the reads a
 * scene's resources are, placed from the project's root; a user:// path is
 * the player's data directory, outside this repository. Drops the loads.
 *
 * @param {{ repoPath: string, tracked: Set<string>, files: object[], places: { files: Set<string>, dirs: Set<string> } }} input
 */
export function settleGodotPaths({ repoPath, tracked, files, places }) {
  const projects = godotProjects(repoPath, tracked);
  for (const file of files) {
    if (!file.godot) continue;
    const project = projectOf(projects, file.path);
    const sites = [];
    for (const load of file.godot.loads ?? []) {
      if (load.text.startsWith('user://')) {
        file.outsideReads = (file.outsideReads ?? 0) + 1;
        continue;
      }
      const path = godotPath(project, file.path, load.text, tracked);
      // A literal that names nothing tracked is not a path of this project.
      if (path == null && load.call === 'literal') continue;
      sites.push({ kind: 'read', call: load.call, values: path ? [{ text: path, open: false, anchor: 'file' }] : [] });
    }
    if (sites.length > 0) {
      const placed = placeLandings(file, sites, places);
      file.writes = placed.writes;
      file.reads = placed.reads;
      file.dynamicReads = (file.dynamicReads ?? 0) + placed.dynamicReads;
    }
    if (file.godot.dynamicReads) file.dynamicReads = (file.dynamicReads ?? 0) + file.godot.dynamicReads;
    delete file.godot;
  }
}

// A res:// path from the project's root, or a path relative to the file.
function godotPath(project, from, text, tracked) {
  if (text.startsWith('res://')) return resPath(project, text, tracked);
  if (text.includes('://')) return null;
  const dir = posix.dirname(from) === '.' ? '' : posix.dirname(from);
  const joined = posix.normalize(dir ? `${dir}/${text}` : text);
  return joined.startsWith('../') || joined === '..' || !tracked.has(joined) ? null : joined;
}

/**
 * The first pass of the order of work (core/sequence.js), for GDScript: each
 * function of the file with the calls its body makes, as the binding each
 * goes through. A call to a function of the file is local; one on a const
 * a preload of a script holds (Diorama.new(), IsoMath.to_screen()), or on a
 * global class or an autoload (EventBus.announce()), goes through that
 * import site. The callbacks the engine calls by itself (_ready,
 * _initialize, _process) are the ones invoked.
 */
function gdscriptSequence(root, bound, names) {
  const moduleFunctions = root.namedChildren.filter((child) => child.type === 'function_definition' && child.childForFieldName('name'));
  const byName = new Map(moduleFunctions.map((fn) => [fn.childForFieldName('name').text, fn]));
  const siteFor = (name) => {
    if (bound.has(name)) return { specifier: bound.get(name).specifier, line: bound.get(name).line };
    if (names.has(name)) return { specifier: `global:${name}`, line: names.get(name) };
    return null;
  };
  const visit = (node, steps) => {
    if (!node || node.type === 'function_definition' || node.type === 'lambda') return;
    if (node.type === 'if_statement' && earlyReturn(node)) {
      const condition = node.childForFieldName('condition');
      visit(condition, steps);
      const inner = [];
      visit(node.childForFieldName('body'), inner);
      for (const step of inner) steps.push({ ...step, branch: step.branch ?? conditionText(condition) });
      return;
    }
    if (node.type === 'call' && node.namedChildren[0]?.type === 'identifier') {
      for (const arg of node.childForFieldName('arguments')?.namedChildren ?? []) visit(arg, steps);
      const name = node.namedChildren[0].text;
      if (byName.has(name)) steps.push({ kind: 'local', fn: byName.get(name).startIndex, line: lineOf(node) });
      return;
    }
    if (node.type === 'attribute' && node.namedChildren[0]?.type === 'identifier' && node.namedChildren[1]?.type === 'attribute_call') {
      const base = node.namedChildren[0].text;
      const call = node.namedChildren[1];
      for (const arg of call.childForFieldName('arguments')?.namedChildren ?? []) visit(arg, steps);
      const site = siteFor(base);
      if (site) steps.push({ kind: 'import', name: call.namedChildren[0]?.text ?? '', line: lineOf(node), site, ...(bound.has(base) ? { receiver: base } : {}) });
      for (const rest of node.namedChildren.slice(2)) visit(rest, steps);
      return;
    }
    for (const child of node.namedChildren) visit(child, steps);
  };
  const functions = moduleFunctions.map((fn) => {
    const steps = [];
    visit(fn.childForFieldName('body'), steps);
    const name = fn.childForFieldName('name').text;
    return { id: fn.startIndex, name, line: lineOf(fn), moduleLevel: true, exported: !name.startsWith('_'), isDefaultExport: false, steps };
  });
  const invoked = moduleFunctions.filter((fn) => CALLBACKS.has(fn.childForFieldName('name').text)).map((fn) => fn.startIndex);
  return { functions, topLevel: invoked, reexports: [] };
}

// if cond: ...; return, with no else: the other way the function goes.
function earlyReturn(node) {
  if (node.namedChildren.some((child) => child.type === 'else_clause' || child.type === 'elif_clause')) return false;
  const body = node.childForFieldName('body');
  const last = body?.namedChildren.filter((child) => child.type !== 'comment').at(-1);
  return last?.type === 'return_statement';
}

function conditionText(node) {
  const text = (node?.text ?? '').replace(/\s+/g, ' ').trim();
  return text.length > CONDITION_SHOWN ? `${text.slice(0, CONDITION_SHOWN - 1)}…` : text;
}

/**
 * A GDScript string's text: "a", 'a', a StringName &"a" or a NodePath ^"a",
 * escapes read.
 */
export function stringText(node) {
  if (node?.type !== 'string') return null;
  const raw = node.text.replace(/^[&^]/, '');
  const quote = raw.startsWith('"""') ? '"""' : raw.startsWith("'''") ? "'''" : raw[0];
  if (quote !== '"' && quote !== "'" && quote !== '"""' && quote !== "'''") return null;
  return raw.slice(quote.length, raw.length - quote.length).replace(/\\(.)/g, '$1');
}

function walk(root, visit) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    visit(node);
    for (let i = node.namedChildren.length - 1; i >= 0; i -= 1) stack.push(node.namedChildren[i]);
  }
}

function lineOf(node) {
  return node.startPosition.row + 1;
}
