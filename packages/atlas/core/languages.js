import { extname } from 'node:path';

// The files Atlas parses. A directory a door runs stands for the code files
// under it, and the same table decides both, so a directory recorded in place
// of the files under it is expanded back to exactly those files.
export const LANGUAGE_BY_EXT = new Map([
  ['.js', 'javascript'],
  ['.mjs', 'javascript'],
  ['.cjs', 'javascript'],
  ['.jsx', 'javascript'],
  ['.ts', 'typescript'],
  ['.mts', 'typescript'],
  ['.cts', 'typescript'],
  ['.tsx', 'tsx'],
  ['.py', 'python'],
]);

export function languageOf(path) {
  return LANGUAGE_BY_EXT.get(extname(path).toLowerCase()) ?? null;
}

export function isCodePath(path) {
  return languageOf(path) != null;
}

/**
 * An import site that loads a package manifest, for a field such as the
 * version: it reads a file and runs none of it, so it is a read of that file,
 * never an import of the part that holds it. A require.resolve of another
 * package's manifest locates that package, which is a dependency on it, and
 * is not one of these.
 *
 * @param {{ resolved?: { outcome?: string, path?: string }, locates?: boolean }} site
 */
export function loadsManifest(site) {
  if (site?.resolved?.outcome !== 'file' || site.locates) return false;
  const path = site.resolved.path;
  const base = path.slice(path.lastIndexOf('/') + 1);
  return base === 'package.json' || base === 'pyproject.toml';
}
