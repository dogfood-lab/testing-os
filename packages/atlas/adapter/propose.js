import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import picomatch from 'picomatch';

const MANIFEST_BASENAMES = new Set(['pyproject.toml', 'setup.py', 'setup.cfg']);

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

function memberDirs(patterns, paths) {
  const matchers = patterns.map((pattern) => picomatch(pattern, { dot: true }));
  const dirs = [];
  for (const path of paths) {
    if (inAtlas(path) || !path.endsWith('/package.json')) continue;
    const dir = path.slice(0, -'/package.json'.length);
    if (dir && matchers.some((matches) => matches(dir))) dirs.push(dir);
  }
  return [...new Set(dirs)];
}

function claimed(path, dirs) {
  return dirs.some((dir) => path === dir || path.startsWith(`${dir}/`));
}

export function manifestDirs(repoPath, paths) {
  const dirs = [];
  for (const path of paths) {
    if (inAtlas(path)) continue;
    const slash = path.lastIndexOf('/');
    const base = slash === -1 ? path : path.slice(slash + 1);
    const dir = slash === -1 ? '' : path.slice(0, slash);
    if (base === 'package.json') {
      const pkg = readJson(repoPath, path);
      if (pkg && typeof pkg.name === 'string' && pkg.name.trim() !== '') dirs.push(dir);
    } else if (MANIFEST_BASENAMES.has(base)) {
      dirs.push(dir);
    }
  }
  return [...new Set(dirs)];
}

/**
 * Basename when it is unique. When two manifests share a basename, the name
 * is the directory path, so the parent disambiguates and the scoped package
 * name is never the identity.
 *
 * A repository root that sits beside other manifests is not a boundary. Its
 * glob would be everything, and every package file would overlap.
 */
/** A manifest that contains another manifest is the container, not a second owner. */
export function leafDirs(dirs) {
  return dirs.filter((dir) => dir !== '' && !dirs.some((other) => other.startsWith(`${dir}/`)));
}

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

/**
 * The two rules compose. Workspace members, or every leaf manifest when the
 * root names no workspaces, are claimed first. Each remaining top-level
 * directory then gets one boundary. A directory that already contains a
 * package boundary is left alone: its glob would swallow that package, and a
 * glob list cannot subtract. Files that sit in the repository root form one
 * boundary named root, glob *, which does not cross a separator.
 */
export function proposalSet(repoPath, paths) {
  const root = paths.includes('package.json') ? readJson(repoPath, 'package.json') : null;
  const patterns = workspacePatterns(root);
  let packageDirs;
  let packageSource;
  if (patterns) {
    packageDirs = memberDirs(patterns, paths);
    packageSource = 'workspace packages';
  } else {
    const manifests = manifestDirs(repoPath, paths).filter((dir) => dir !== '');
    packageDirs = manifests.length > 0 ? leafDirs(manifests) : [];
    packageSource = 'manifests';
  }
  const tops = [];
  const seen = new Set();
  for (const path of paths) {
    if (inAtlas(path) || claimed(path, packageDirs)) continue;
    const slash = path.indexOf('/');
    if (slash === -1) continue;
    const top = path.slice(0, slash);
    if (top === 'atlas' || seen.has(top)) continue;
    if (packageDirs.some((dir) => dir === top || dir.startsWith(`${top}/`))) continue;
    seen.add(top);
    tops.push(top);
  }
  const proposals = nameProposals([...packageDirs, ...tops]);
  if (paths.some((path) => !inAtlas(path) && !path.includes('/'))) {
    for (const proposal of proposals) {
      if (proposal.name === 'root') proposal.name = proposal.dir;
    }
    proposals.push({ dir: '', name: 'root', glob: '*' });
    proposals.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
  let source = 'top-level directories';
  if (packageDirs.length > 0 && tops.length > 0) source = `${packageSource} and top-level directories`;
  else if (packageDirs.length > 0) source = packageSource;
  return { source, proposals };
}
