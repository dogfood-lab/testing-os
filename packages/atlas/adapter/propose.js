import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

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

function hasWorkspaces(pkg) {
  if (!pkg || pkg.workspaces == null) return false;
  return Array.isArray(pkg.workspaces) || typeof pkg.workspaces === 'object';
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

export function proposalSet(repoPath, paths) {
  const root = paths.includes('package.json') ? readJson(repoPath, 'package.json') : null;
  const dirs = manifestDirs(repoPath, paths);
  const multi = hasWorkspaces(root) || dirs.length > 1;
  if (multi) return { source: 'package manifests', proposals: nameProposals(dirs) };
  const tops = new Set();
  for (const path of paths) {
    if (inAtlas(path)) continue;
    const slash = path.indexOf('/');
    if (slash === -1) continue;
    const top = path.slice(0, slash);
    if (top === 'atlas') continue;
    tops.add(top);
  }
  return { source: 'top-level directories', proposals: nameProposals([...tops]) };
}
