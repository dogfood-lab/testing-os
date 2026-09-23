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
