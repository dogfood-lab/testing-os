import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import picomatch from 'picomatch';
import { parse as parseYaml } from 'yaml';
import { parseToml } from '../core/toml.js';

const MANIFEST_BASENAMES = new Set(['pyproject.toml', 'setup.py', 'setup.cfg', 'project.godot', 'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts']);
// A .NET project file marks its directory as a project, whatever it is called.
const PROJECT_FILE = /\.(?:csproj|fsproj|vbproj)$/i;
// A directory named for what it holds side by side (packages/<name>/): each
// directory in it beside a project is a project of its own, manifest or not.
const PROJECT_HOMES = new Set(['packages', 'apps', 'libs', 'crates', 'services', 'projects', 'plugins', 'extensions', 'modules', 'examples']);
// A manifest under one of these is a sample a test works on, not a package of
// this repository, so it proposes no part; the test directory holding it does.
const TEST_HOMES = new Set(['test', 'tests', 'fixtures', '__fixtures__', '__tests__', 'spec']);

function inTestMaterial(path) {
  return path.split('/').slice(0, -1).some((part) => TEST_HOMES.has(part));
}

function inAtlas(path) {
  return path === 'atlas' || path.startsWith('atlas/');
}

export function listTracked(repoPath) {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: repoPath,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) return null;
  return result.stdout.split('\0').filter(Boolean);
}

function readJson(repoPath, rel) {
  try {
    return JSON.parse(readFileSync(join(repoPath, rel), 'utf8'));
  } catch {
    return null;
  }
}

function workspacePatterns(pkg) {
  if (!pkg || pkg.workspaces == null) return null;
  if (Array.isArray(pkg.workspaces)) return pkg.workspaces.filter((pattern) => typeof pattern === 'string');
  if (Array.isArray(pkg.workspaces.packages)) return pkg.workspaces.packages.filter((pattern) => typeof pattern === 'string');
  return [];
}

// The members pnpm-workspace.yaml lists, a ! glob excluding; null with none.
function pnpmPatterns(repoPath, paths) {
  if (!paths.includes('pnpm-workspace.yaml')) return null;
  try {
    const doc = parseYaml(readFileSync(join(repoPath, 'pnpm-workspace.yaml'), 'utf8'));
    return Array.isArray(doc?.packages) ? doc.packages.filter((pattern) => typeof pattern === 'string') : null;
  } catch {
    return null;
  }
}

// Every directory that holds a tracked file, at any depth.
function trackedDirs(paths) {
  const dirs = new Set();
  for (const path of paths) {
    for (let at = path.indexOf('/'); at !== -1; at = path.indexOf('/', at + 1)) dirs.add(path.slice(0, at));
  }
  return dirs;
}

/**
 * The directories a workspace's patterns name: each tracked directory a
 * pattern matches and none excludes, a manifest in it or not. A directory
 * laid out as a member (packages/<name>/) is a project of the workspace
 * though it is written in a language with no package.json.
 */
function memberDirs(patterns, paths) {
  const clean = (pattern) => pattern.replace(/^(!?)\.\//, '$1').replace(/\/+$/, '');
  const included = patterns.filter((pattern) => !pattern.startsWith('!')).map(clean);
  const excluded = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => clean(pattern.slice(1)));
  if (included.length === 0) return [];
  const isMatch = picomatch(included, { dot: true });
  const isExcluded = excluded.length > 0 ? picomatch(excluded, { dot: true }) : () => false;
  const tracked = new Set(paths);
  const matched = new Set([...trackedDirs(paths)].filter((dir) => !inAtlas(dir) && !inTestMaterial(`${dir}/x`) && isMatch(dir) && !isExcluded(dir)));
  // Under a pattern that reaches any depth (packages/**), a directory is a
  // member when it holds a manifest or no matched directory holds it.
  const above = (dir) => [...matched].some((other) => dir.startsWith(`${other}/`));
  return [...matched].filter((dir) => tracked.has(`${dir}/package.json`) || !above(dir)).sort();
}

export function manifestDirs(repoPath, paths) {
  const dirs = [];
  const named = new Set();
  const crates = [];
  for (const path of paths) {
    if (inAtlas(path) || inTestMaterial(path)) continue;
    const slash = path.lastIndexOf('/');
    const base = slash === -1 ? path : path.slice(slash + 1);
    const dir = slash === -1 ? '' : path.slice(0, slash);
    if (base === 'package.json') {
      const pkg = readJson(repoPath, path);
      if (pkg && typeof pkg.name === 'string' && pkg.name.trim() !== '') {
        dirs.push(dir);
        named.add(dir);
      }
    } else if (MANIFEST_BASENAMES.has(base) || PROJECT_FILE.test(base)) {
      dirs.push(dir);
    } else if (base === 'Cargo.toml' && isCrate(repoPath, path)) {
      crates.push(dir);
    }
  }
  // A Tauri app's Rust half is built with the web package it sits in, into
  // one app, so it is that package's and proposes no part of its own.
  const tracked = new Set(paths);
  for (const dir of crates) {
    const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
    const tauri = TAURI_CONFIGS.some((name) => tracked.has(dir ? `${dir}/${name}` : name));
    if (!(tauri && named.has(parent))) dirs.push(dir);
  }
  return [...new Set(dirs)];
}

const TAURI_CONFIGS = ['tauri.conf.json', 'tauri.conf.json5', 'Tauri.toml'];

// A Cargo.toml with a [package] is a crate; one with only a [workspace] is
// the workspace around crates, as a package.json with no name is.
function isCrate(repoPath, path) {
  try {
    const doc = parseToml(readFileSync(join(repoPath, path), 'utf8'));
    return typeof doc.package?.name === 'string' && doc.package.name !== '';
  } catch {
    return false;
  }
}

/** A manifest that contains another manifest is the container, not a second owner. */
export function leafDirs(dirs) {
  return dirs.filter((dir) => dir !== '' && !dirs.some((other) => other.startsWith(`${dir}/`)));
}

/**
 * Basename when it is unique. When two directories share a basename, the
 * name is the directory path, so the parent disambiguates and the scoped
 * package name is never the identity.
 */
export function nameProposals(dirs) {
  const items = [...new Set(dirs)].filter((dir) => dir !== '').map((dir) => ({
    dir,
    base: dir.split('/').pop(),
  }));
  const counts = new Map();
  for (const item of items) counts.set(item.base, (counts.get(item.base) ?? 0) + 1);
  return items
    .map((item) => ({
      dir: item.dir,
      name: counts.get(item.base) > 1 ? item.dir : item.base,
      glob: `${item.dir}/**`,
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function escapeGlob(text) {
  return text.replace(/[*?[\]{}()!+@\\]/g, '\\$&');
}

/**
 * The globs that hold every tracked file under dir that no project under it
 * owns: the whole directory when no project is under it; otherwise its own
 * files, and each directory in it the same way, a project's left out.
 *
 * @param {string} dir
 * @param {Set<string>} projects
 * @param {{ files: Map<string, boolean>, children: Map<string, string[]> }} tree
 */
function ownGlobs(dir, projects, tree) {
  const nested = [...projects].some((other) => other.startsWith(`${dir}/`));
  if (!nested) return [`${escapeGlob(dir)}/**`];
  const out = tree.files.get(dir) ? [`${escapeGlob(dir)}/*`] : [];
  for (const child of tree.children.get(dir) ?? []) {
    if (projects.has(child)) continue;
    out.push(...ownGlobs(child, projects, tree));
  }
  return out;
}

// Which directories hold tracked files of their own, and the directories in each.
function treeOf(paths) {
  const files = new Map();
  const children = new Map();
  for (const path of paths) {
    const parts = path.split('/');
    for (let depth = 1; depth < parts.length; depth += 1) {
      const dir = parts.slice(0, depth).join('/');
      const parent = parts.slice(0, depth - 1).join('/');
      if (!children.has(parent)) children.set(parent, new Set());
      children.get(parent).add(dir);
    }
    if (parts.length > 1) files.set(parts.slice(0, -1).join('/'), true);
  }
  return { files, children: new Map([...children].map(([dir, set]) => [dir, [...set].sort()])) };
}

/**
 * The proposal leaves no tracked file in no part. Projects come first: the
 * workspace's members (package.json workspaces or pnpm-workspace.yaml),
 * or else every directory a manifest marks as a project (a package.json
 * with a name, a pyproject.toml, a crate's Cargo.toml, a .csproj and the
 * like), a project inside another split out of it. A directory in a home of
 * projects (packages/, apps/, crates/ and the like) beside a project is a
 * project too, manifest or not. Each project is a part of what it holds
 * outside the projects inside it. Each other top-level directory is a part
 * of what it holds outside the projects in it, and the files at the
 * repository root form one part named root, glob *, which does not cross a
 * separator. A glob list cannot subtract, so a part that holds projects
 * names what it keeps: its own files (dir/*) and each directory beside the
 * projects (dir/child/**).
 */
export function proposalSet(repoPath, paths) {
  const kept = paths.filter((path) => !inAtlas(path));
  const root = kept.includes('package.json') ? readJson(repoPath, 'package.json') : null;
  const patterns = workspacePatterns(root) ?? pnpmPatterns(repoPath, kept);
  let projects;
  let packageSource;
  if (patterns) {
    projects = memberDirs(patterns, kept);
    packageSource = 'workspace packages';
  } else {
    projects = manifestDirs(repoPath, kept).filter((dir) => dir !== '');
    packageSource = 'manifests';
  }
  const tree = treeOf(kept);
  const projectSet = new Set(projects);
  // A directory beside a project in a home of projects is one.
  for (const dir of [...projectSet]) {
    const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
    if (!PROJECT_HOMES.has(parent.split('/').pop())) continue;
    for (const sibling of tree.children.get(parent) ?? []) {
      if (!inTestMaterial(`${sibling}/x`) && ![...projectSet].some((other) => other === sibling || sibling.startsWith(`${other}/`))) projectSet.add(sibling);
    }
  }
  const tops = [...new Set(kept.filter((path) => path.includes('/')).map((path) => path.slice(0, path.indexOf('/'))))]
    .filter((top) => !projectSet.has(top))
    .sort();
  const dirs = [...projectSet, ...tops];
  const proposals = nameProposals(dirs).map(({ dir, name }) => ({ dir, name, globs: ownGlobs(dir, projectSet, tree) }))
    .filter((proposal) => proposal.globs.length > 0);
  if (kept.some((path) => !path.includes('/'))) {
    for (const proposal of proposals) {
      if (proposal.name === 'root') proposal.name = proposal.dir;
    }
    proposals.push({ dir: '', name: 'root', globs: ['*'] });
    proposals.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
  const fromProjects = projectSet.size > 0;
  const fromTops = tops.length > 0;
  const source = fromProjects && fromTops ? `${packageSource} and top-level directories` : fromProjects ? packageSource : 'top-level directories';
  return { source, proposals };
}
