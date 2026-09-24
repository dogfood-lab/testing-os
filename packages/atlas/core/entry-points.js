import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import picomatch from 'picomatch';
import { cargoProject } from './cargo.js';
import { godotProjects } from './godot.js';
import { repositoryView } from './commands.js';
import { isTestFile, isTestMaterial } from './landings.js';
import { declaredScripts } from './python-manifest.js';
import { resolveDeclaredPath, resolvePythonModule, unplacedBuildOutput } from './resolve.js';

const FALLBACKS = [
  (name) => name.startsWith('index.'),
  (name) => name.startsWith('main.'),
  (name) => name.startsWith('cli.'),
  (name) => name === '__main__.py',
];

/**
 * Entry points are structural. The root is the shallowest directory shared by
 * the globs, so a boundary that covers several packages is not given one of
 * them at random. A console script a pyproject.toml installs, and a file a
 * manifest declares as a command or as its package's main, is an entry of
 * whichever boundary holds it, so bin/ is the entry part of a root
 * package.json whose bin lives there although bin/ has no manifest of its
 * own. An entry is always one of the boundary's own files: the root
 * boundary of that same repository gets no entry from the bin, since bin/ is
 * not in it. A crate's library and a Godot project's autoloads are entries
 * of the part that holds them, as a crate's binaries and a project's main
 * scene are through the commands.
 *
 * @param {{ repoPath: string, globs: string[], tracked: Set<string>, scripts?: Array<{ path: string }>, commands?: Array<{ path: string }>, crates?: Array<{ path: string }> }} input
 *   scripts is pythonScripts(), commands is manifestCommands() and crates
 *   is declaredEntries() for the repository, each read once per map
 */
export function deriveEntryPoints({ repoPath, globs, tracked, scripts = [], commands = [], crates = [] }) {
  if (!Array.isArray(globs) || globs.length === 0) return [];
  const inside = picomatch(globs, { dot: true });
  const root = boundaryRoot(globs);
  const manifest = root ? `${root}/package.json` : 'package.json';
  const declared = [...scripts, ...commands, ...crates].map((entry) => entry.path).filter((path) => path != null && inside(path));
  let found;
  if (tracked.has(manifest)) found = [...fromPackage(repoPath, root, manifest, tracked), ...declared];
  else found = declared.length > 0 ? declared : fromNames(root, tracked);
  // A test is run by its runner, never by a person as the part's way in.
  return [...new Set(found.filter((path) => inside(path) && !isTestFile(path)))].sort();
}

/**
 * The files the console and GUI scripts of every tracked pyproject.toml run,
 * with the command's name, the manifest and the function each calls, in the
 * order the manifests declare them. A module that is not a tracked file is
 * left out.
 *
 * @param {string} repoPath
 * @param {Set<string>} tracked
 * @returns {Array<{ path: string, fn: string | null, name: string, manifest: string }>}
 */
export function pythonScripts(repoPath, tracked) {
  const out = [];
  for (const script of declaredScripts(repoPath, [...tracked].sort())) {
    const base = script.manifest.includes('/') ? script.manifest.slice(0, script.manifest.lastIndexOf('/')) : '';
    const roots = script.packageDir ? [base ? `${base}/${script.packageDir}` : script.packageDir] : [];
    const path = resolvePythonModule(script.module, tracked, roots);
    if (path) out.push({ path, fn: script.fn, name: script.name, manifest: script.manifest });
  }
  return out;
}

/**
 * What a repository installs for people to use, read from its manifests:
 * every bin of the root package.json and of each npm workspace member's,
 * every script a pyproject.toml declares, every binary a crate's Cargo.toml
 * declares or Cargo finds (a Tauri app's being the desktop app, marked app
 * desktop), the main scene of every Godot project (the game, marked app
 * game), and, when the root package is
 * published (it has a name and is not private), the file its exports["."] or
 * main loads, with in `paths` every file an exports subpath names (types
 * and the manifest itself aside), which an import of the package can load. A manifest inside test material is a copy a test works on, not
 * one of this repository's, and a declared file that is not tracked names
 * nothing to follow. A declared file that is a build's output (dist/cli.js)
 * is traced to its source through the tracked build configs; when none places
 * it, the command is still installed, so it is kept with path null and the
 * declared path as unplaced.
 *
 * @param {string} repoPath
 * @param {Set<string>} tracked
 * @param {Array<{ path: string, name: string, manifest: string }>} scripts pythonScripts()
 * @returns {Array<{ kind: 'command'|'package', name: string, manifest: string, path: string|null, unplaced?: string, app?: 'desktop'|'game' }>}
 *   sorted by manifest, then name
 */
export function manifestCommands(repoPath, tracked, scripts = []) {
  const out = [];
  const root = readManifest(repoPath, 'package.json', tracked);
  const dirs = root ? ['', ...workspaceDirs(repoPath, tracked)] : [];
  for (const dir of dirs) {
    const manifest = dir ? `${dir}/package.json` : 'package.json';
    if (isTestMaterial(manifest)) continue;
    const pkg = dir ? readManifest(repoPath, manifest, tracked) : root;
    if (!pkg) continue;
    // A private member's command is installed by no one; index.js decides
    // whether a package it publishes bundles the file.
    const member = dir !== '' && pkg.private === true;
    for (const [name, spec] of binEntries(pkg)) {
      const path = declaredFile(repoPath, dir, spec, tracked);
      const unplaced = path ? null : unplacedFile(repoPath, dir, spec, tracked);
      const privately = member ? { privateMember: true, declared: joinRelative(dir, spec) } : {};
      if (path) out.push({ kind: 'command', name, manifest, path, ...privately });
      else if (unplaced) out.push({ kind: 'command', name, manifest, path: null, unplaced, ...privately });
    }
    if (dir !== '' || typeof pkg.name !== 'string' || pkg.name === '' || pkg.private === true) continue;
    const specs = mainSpecs(pkg);
    const loaded = specs.map((spec) => declaredFile(repoPath, dir, spec, tracked)).find(Boolean);
    const unplaced = loaded ? null : specs.map((spec) => unplacedFile(repoPath, dir, spec, tracked)).find(Boolean);
    const exported = exportSpecs(pkg).map((spec) => declaredFile(repoPath, dir, spec, tracked)).filter(Boolean);
    if (loaded) out.push({ kind: 'package', name: pkg.name, manifest, path: loaded, paths: [...new Set([loaded, ...exported])].sort(compare) });
    else if (unplaced) out.push({ kind: 'package', name: pkg.name, manifest, path: null, unplaced });
  }
  for (const script of scripts) {
    if (!isTestMaterial(script.manifest)) out.push({ kind: 'command', name: script.name, manifest: script.manifest, path: script.path });
  }
  for (const crate of cargoProject(repoPath, tracked).crates) {
    for (const bin of crate.bins) out.push({ kind: 'command', name: bin.name, manifest: crate.manifest, path: bin.path, ...(desktopBin(crate, bin) ? { app: 'desktop' } : {}) });
  }
  // A Godot project is a game the engine runs from its main scene.
  for (const project of godotProjects(repoPath, tracked)) {
    if (project.mainScene) out.push({ kind: 'command', name: 'the game', manifest: project.file, path: project.mainScene, app: 'game' });
  }
  const unique = new Map(out.map((entry) => [`${entry.manifest}\0${entry.name}\0${entry.kind}`, entry]));
  return [...unique.values()].sort((a, b) => compare(a.manifest, b.manifest) || compare(a.name, b.name) || compare(a.kind, b.kind));
}

/**
 * The files a manifest declares as entries of whichever part holds them,
 * past the commands it installs: the library of every crate, which the
 * crate's other targets and the crates depending on it import, and each
 * autoload of a Godot project, which the engine loads before any scene.
 *
 * @param {string} repoPath
 * @param {Set<string>} tracked
 * @returns {Array<{ path: string }>}
 */
export function declaredEntries(repoPath, tracked) {
  return [
    ...cargoProject(repoPath, tracked).crates.filter((crate) => crate.lib).map((crate) => ({ path: crate.lib.path })),
    ...godotProjects(repoPath, tracked).flatMap((project) => project.autoloads.map((autoload) => ({ path: autoload.path }))),
  ];
}

// A Tauri app's binary is the desktop app: the one src/main.rs is, or the
// crate's only one. A second binary beside it is a command of its own.
function desktopBin(crate, bin) {
  if (!crate.tauri) return false;
  return crate.bins.length === 1 || bin.path === (crate.dir ? `${crate.dir}/src/main.rs` : 'src/main.rs');
}

function readManifest(repoPath, path, tracked) {
  if (!tracked.has(path)) return null;
  try {
    const pkg = JSON.parse(readFileSync(join(repoPath, path), 'utf8'));
    return pkg != null && typeof pkg === 'object' && !Array.isArray(pkg) ? pkg : null;
  } catch {
    return null;
  }
}

// The members package.json and pnpm-workspace.yaml list, read by the reader
// the commands and the resolver use.
function workspaceDirs(repoPath, tracked) {
  return [...repositoryView({ repoPath, tracked }).workspaces().keys()].sort(compare);
}

// A string bin is the package's one command, named for the package without
// its scope, the way npm installs it.
function binEntries(pkg) {
  if (typeof pkg.bin === 'string') {
    return typeof pkg.name === 'string' && pkg.name !== '' ? [[pkg.name.replace(/^@[^/]+\//, ''), pkg.bin]] : [];
  }
  if (pkg.bin == null || typeof pkg.bin !== 'object' || Array.isArray(pkg.bin)) return [];
  return Object.entries(pkg.bin).filter(([, spec]) => typeof spec === 'string');
}

// exports may be the path itself, a map of subpaths, or a map of conditions
// for the root alone; "." is what an import of the bare name loads.
function mainSpecs(pkg) {
  const specs = [];
  const { exports } = pkg;
  if (typeof exports === 'string') specs.push(exports);
  else if (exports && typeof exports === 'object' && !Array.isArray(exports)) {
    const subpaths = Object.keys(exports).some((key) => key.startsWith('.'));
    collectStrings(subpaths ? exports['.'] : exports, specs);
  }
  if (typeof pkg.main === 'string') specs.push(pkg.main);
  return specs;
}

// Every file an exports map names, under every subpath and condition but a
// types one; ./package.json is the manifest, not code the package loads.
function exportSpecs(pkg) {
  const { exports } = pkg;
  if (typeof exports === 'string') return [exports];
  if (exports == null || typeof exports !== 'object' || Array.isArray(exports)) return [];
  const subpaths = Object.keys(exports).some((key) => key.startsWith('.'));
  const specs = [];
  const collect = (value) => {
    if (typeof value === 'string') {
      if (!/\.d\.[cm]?ts$/.test(value)) specs.push(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) if (key !== 'types' && key !== 'typings') collect(child);
    }
  };
  if (!subpaths) collect(exports);
  else for (const [key, value] of Object.entries(exports)) if (key !== './package.json' && !key.includes('*')) collect(value);
  return specs;
}

function declaredFile(repoPath, dir, spec, tracked) {
  const rel = joinRelative(dir, spec);
  return rel ? resolveDeclaredPath(repoPath, rel, tracked) : null;
}

function unplacedFile(repoPath, dir, spec, tracked) {
  const rel = joinRelative(dir, spec);
  return rel && unplacedBuildOutput(repoPath, rel, tracked) ? rel : null;
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function boundaryRoot(globs) {
  const dirs = (globs ?? []).map(globDirectory);
  if (dirs.length === 0) return '';
  const split = dirs.map((dir) => (dir ? dir.split('/') : []));
  const first = split[0];
  let length = 0;
  while (split.every((parts) => parts.length > length && parts[length] === first[length])) length += 1;
  return first.slice(0, length).join('/');
}

function globDirectory(glob) {
  const parts = String(glob).replaceAll('\\', '/').split('/');
  const kept = [];
  for (const part of parts) {
    if (part === '' || part.includes('*') || part.includes('?') || part.includes('[')) break;
    kept.push(part);
  }
  return kept.join('/');
}

function fromPackage(repoPath, root, manifest, tracked) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(repoPath, manifest), 'utf8'));
  } catch {
    return [];
  }
  const specs = [];
  if (typeof pkg.main === 'string') specs.push(pkg.main);
  if (typeof pkg.bin === 'string') specs.push(pkg.bin);
  else if (pkg.bin && typeof pkg.bin === 'object') {
    for (const target of Object.values(pkg.bin)) {
      if (typeof target === 'string') specs.push(target);
    }
  }
  const dot = pkg.exports?.['.'];
  collectStrings(dot, specs);
  const found = new Set();
  for (const spec of specs) {
    const rel = joinRelative(root, spec);
    const resolved = rel ? resolveDeclaredPath(repoPath, rel, tracked) : null;
    if (resolved) found.add(resolved);
  }
  return [...found].sort();
}

function collectStrings(value, out) {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const child of Object.values(value)) collectStrings(child, out);
  }
}

function joinRelative(root, spec) {
  if (typeof spec !== 'string' || spec.includes('://')) return null;
  const cleaned = spec.replaceAll('\\', '/').replace(/^\.\//, '');
  if (cleaned.startsWith('/') || cleaned.split('/').includes('..')) return null;
  return root ? `${root}/${cleaned}` : cleaned;
}

function fromNames(root, tracked) {
  const children = [];
  for (const path of tracked) {
    const slash = path.lastIndexOf('/');
    const dir = slash === -1 ? '' : path.slice(0, slash);
    if (dir !== root || isTestFile(path)) continue;
    children.push(path);
  }
  for (const match of FALLBACKS) {
    const hits = children.filter((path) => match(path.slice(path.lastIndexOf('/') + 1)));
    if (hits.length > 0) return hits.sort();
  }
  return [];
}
