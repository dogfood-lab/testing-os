import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDeclaredPath } from './resolve.js';

const FALLBACKS = [
  (name) => name.startsWith('index.'),
  (name) => name.startsWith('main.'),
  (name) => name.startsWith('cli.'),
  (name) => name === '__main__.py',
];

/**
 * Entry points are structural. The root is the shallowest directory shared by
 * the globs, so a boundary that covers several packages is not given one of
 * them at random.
 */
export function deriveEntryPoints({ repoPath, globs, tracked }) {
  const root = boundaryRoot(globs);
  const manifest = root ? `${root}/package.json` : 'package.json';
  if (tracked.has(manifest)) return fromPackage(repoPath, root, manifest, tracked);
  return fromNames(root, tracked);
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
    if (dir !== root) continue;
    children.push(path);
  }
  for (const match of FALLBACKS) {
    const hits = children.filter((path) => match(path.slice(path.lastIndexOf('/') + 1)));
    if (hits.length > 0) return hits.sort();
  }
  return [];
}
