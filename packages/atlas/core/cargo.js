import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import picomatch from 'picomatch';
import { isTestMaterial } from './landings.js';
import { storedText } from './text.js';
import { parseToml } from './toml.js';

/**
 * The Rust crates a repository holds, read from its tracked Cargo.toml
 * files the way Cargo reads them: a manifest with a [package] is a crate,
 * and its targets are the ones it declares and the ones Cargo finds by
 * convention (src/lib.rs, src/main.rs, src/bin/, tests/, examples/,
 * benches/, build.rs). A manifest with only a [workspace] is the workspace,
 * whose members are the crates its globs name. Every path is tracked; a
 * target Cargo would find in a file the repository does not track (a build's
 * output under target/) is not one.
 */

const CACHE = new WeakMap();
const DEPENDENCY_TABLES = ['dependencies', 'dev-dependencies', 'build-dependencies'];
// The crates every Rust program can name without declaring them.
export const RUST_STD = new Set(['std', 'core', 'alloc', 'proc_macro', 'test']);

/**
 * @param {string} repoPath
 * @param {Set<string>} tracked
 * @returns {{ crates: object[], workspaces: object[] }}
 */
export function cargoProject(repoPath, tracked) {
  if (CACHE.has(tracked)) return CACHE.get(tracked);
  const manifests = [...tracked].filter((path) => posix.basename(path) === 'Cargo.toml' && !isTestMaterial(path)).sort();
  const read = new Map();
  for (const path of manifests) {
    let doc = {};
    try {
      doc = parseToml(storedText(readFileSync(join(repoPath, path), 'utf8')));
    } catch {
      doc = {};
    }
    read.set(path, doc);
  }
  const workspaces = manifests.filter((path) => isTable(read.get(path).workspace)).map((path) => workspaceOf(path, read.get(path)));
  const crates = manifests
    .filter((path) => typeof read.get(path).package?.name === 'string' && read.get(path).package.name !== '')
    .map((path) => crateOf(path, read.get(path), tracked, workspaces));
  for (const workspace of workspaces) {
    workspace.members = crates.filter((crate) => crate.workspace === workspace.manifest).map((crate) => crate.manifest);
  }
  const project = { crates, workspaces };
  CACHE.set(tracked, project);
  return project;
}

function isTable(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function dirOf(path) {
  const dir = posix.dirname(path);
  return dir === '.' ? '' : dir;
}

function under(dir, path) {
  return dir === '' ? path : `${dir}/${path}`;
}

function clean(path) {
  const normalized = posix.normalize(String(path).replaceAll('\\', '/')).replace(/\/+$/, '');
  if (normalized === '.') return '';
  if (normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}

function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function workspaceOf(manifest, doc) {
  const dir = dirOf(manifest);
  const table = doc.workspace;
  const globs = strings(table.members).map((glob) => clean(under(dir, glob))).filter((glob) => glob != null);
  const excluded = strings(table.exclude).map((glob) => clean(under(dir, glob))).filter((glob) => glob != null);
  const defaults = strings(table['default-members']).map((glob) => clean(under(dir, glob))).filter((glob) => glob != null);
  return {
    manifest,
    dir,
    globs,
    excluded,
    defaults,
    dependencies: isTable(table.dependencies) ? table.dependencies : {},
    root: isTable(doc.package) ? manifest : null,
  };
}

// The workspace a crate belongs to: the nearest one above it whose members
// name its directory, or the workspace its own manifest is the root of.
function memberOf(dir, manifest, workspaces) {
  const holding = workspaces
    .filter((workspace) => workspace.dir === '' || dir === workspace.dir || dir.startsWith(`${workspace.dir}/`))
    .sort((a, b) => b.dir.length - a.dir.length);
  for (const workspace of holding) {
    if (workspace.manifest === manifest) return workspace;
    const listed = workspace.globs.length > 0 && picomatch(workspace.globs)(dir);
    const excluded = workspace.excluded.length > 0 && picomatch(workspace.excluded)(dir);
    if (listed && !excluded) return workspace;
  }
  return null;
}

function crateOf(manifest, doc, tracked, workspaces) {
  const dir = dirOf(manifest);
  const pkg = doc.package;
  const name = pkg.name;
  const has = (path) => tracked.has(under(dir, path));
  const at = (path) => {
    const rel = clean(path);
    return rel == null ? null : under(dir, rel);
  };
  const workspace = memberOf(dir, manifest, workspaces);

  const libTable = isTable(doc.lib) ? doc.lib : null;
  const libPath = typeof libTable?.path === 'string' ? at(libTable.path) : has('src/lib.rs') ? under(dir, 'src/lib.rs') : null;
  const lib = libPath && tracked.has(libPath)
    ? { name: typeof libTable?.name === 'string' ? libTable.name : crateName(name), path: libPath }
    : null;

  const bins = [];
  const addBin = (binName, path) => {
    if (path == null || !tracked.has(path) || bins.some((bin) => bin.path === path || bin.name === binName)) return;
    bins.push({ name: binName, path });
  };
  for (const entry of Array.isArray(doc.bin) ? doc.bin.filter(isTable) : []) {
    if (typeof entry.name !== 'string') continue;
    const path = typeof entry.path === 'string' ? at(entry.path)
      : has(`src/bin/${entry.name}.rs`) ? under(dir, `src/bin/${entry.name}.rs`)
        : has(`src/bin/${entry.name}/main.rs`) ? under(dir, `src/bin/${entry.name}/main.rs`)
          : entry.name === name ? under(dir, 'src/main.rs') : null;
    addBin(entry.name, path);
  }
  if (pkg.autobins !== 'false') {
    addBin(name, has('src/main.rs') ? under(dir, 'src/main.rs') : null);
    for (const path of conventional(tracked, dir, 'src/bin')) addBin(targetName(path), path);
  }

  const targets = (table, folder, auto) => {
    const found = [];
    for (const entry of Array.isArray(doc[table]) ? doc[table].filter(isTable) : []) {
      const path = typeof entry.path === 'string' ? at(entry.path) : typeof entry.name === 'string' ? under(dir, `${folder}/${entry.name}.rs`) : null;
      if (path && tracked.has(path) && !found.includes(path)) found.push(path);
    }
    if (pkg[auto] !== 'false') for (const path of conventional(tracked, dir, folder)) if (!found.includes(path)) found.push(path);
    return found.sort();
  };

  const buildScript = pkg.build === 'false' ? null : typeof pkg.build === 'string' ? at(pkg.build) : under(dir, 'build.rs');
  const deps = new Map();
  const readDeps = (tables) => {
    for (const table of DEPENDENCY_TABLES) {
      for (const [key, value] of Object.entries(isTable(tables?.[table]) ? tables[table] : {})) {
        if (deps.has(crateName(key))) continue;
        deps.set(crateName(key), dependencyOf(key, value, dir, workspace));
      }
    }
  };
  readDeps(doc);
  for (const target of Object.values(isTable(doc.target) ? doc.target : {})) if (isTable(target)) readDeps(target);

  return {
    manifest,
    dir,
    name,
    lib,
    bins: bins.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    tests: targets('test', 'tests', 'autotests'),
    examples: targets('example', 'examples', 'autoexamples'),
    benches: targets('bench', 'benches', 'autobenches'),
    build: buildScript && tracked.has(buildScript) ? buildScript : null,
    deps,
    workspace: workspace?.manifest ?? null,
    tauri: ['tauri.conf.json', 'tauri.conf.json5', 'Tauri.toml'].some(has),
  };
}

/**
 * The name code gives a crate: its package name with each - as _.
 *
 * @param {string} name
 */
export function crateName(name) {
  return String(name).replaceAll('-', '_');
}

// A dependency by the name code gives it, with the package it is and the
// directory it is read from when it is a path of this repository. One the
// workspace declares is read from the workspace's table.
function dependencyOf(key, value, dir, workspace) {
  let spec = isTable(value) ? value : {};
  let base = dir;
  if (spec.workspace === 'true' && workspace) {
    const shared = workspace.dependencies[key];
    spec = { ...(isTable(shared) ? shared : {}), ...spec };
    if (isTable(shared) && typeof shared.path === 'string') base = workspace.dir;
  }
  const path = typeof spec.path === 'string' ? clean(under(base, spec.path)) : null;
  return { package: typeof spec.package === 'string' ? spec.package : key, path };
}

// The files Cargo finds by convention under a folder: folder/*.rs and
// folder/*/main.rs.
function conventional(tracked, dir, folder) {
  const prefix = `${under(dir, folder)}/`;
  const out = [];
  for (const path of tracked) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (/^[^/]+\.rs$/.test(rest) || /^[^/]+\/main\.rs$/.test(rest)) out.push(path);
  }
  return out.sort();
}

function targetName(path) {
  const base = posix.basename(path);
  return base === 'main.rs' ? posix.basename(posix.dirname(path)) : base.replace(/\.rs$/, '');
}

/**
 * Every file Cargo compiles as the root of a crate, with the crate it
 * belongs to and the kind of target: the library, each binary, test,
 * example and bench, and the build script.
 *
 * @param {{ crates: object[] }} project
 * @returns {Array<{ path: string, crate: object, kind: 'lib'|'bin'|'test'|'example'|'bench'|'build' }>}
 */
export function crateRoots(project) {
  const out = [];
  for (const crate of project.crates) {
    if (crate.lib) out.push({ path: crate.lib.path, crate, kind: 'lib' });
    for (const bin of crate.bins) out.push({ path: bin.path, crate, kind: 'bin' });
    for (const path of crate.tests) out.push({ path, crate, kind: 'test' });
    for (const path of crate.examples) out.push({ path, crate, kind: 'example' });
    for (const path of crate.benches) out.push({ path, crate, kind: 'bench' });
    if (crate.build) out.push({ path: crate.build, crate, kind: 'build' });
  }
  return out;
}
