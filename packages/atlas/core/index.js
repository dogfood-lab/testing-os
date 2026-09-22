import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import picomatch from 'picomatch';

/**
 * Map tracked files onto named boundaries.
 *
 * Overlaps are reported and left out of every boundary's file list.
 * Ambiguous ownership is a fact for the human; this function does not pick a winner.
 *
 * @param {{ repoPath: string, boundaries: Array<{ name: string, globs?: string[], status?: string, role?: string }> }} input
 */
export function mapRepository({ repoPath, boundaries } = {}) {
  if (typeof repoPath !== 'string' || repoPath.length === 0) {
    throw new Error('repoPath is required');
  }
  if (!Array.isArray(boundaries)) {
    throw new Error('boundaries must be an array');
  }

  const ordered = boundaries.map(validateBoundary);
  const seen = new Set();
  for (const boundary of ordered) {
    if (seen.has(boundary.name)) {
      throw new Error(`duplicate boundary name: ${boundary.name}`);
    }
    seen.add(boundary.name);
  }
  ordered.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const tracked = listTracked(repoPath);
  const matchers = ordered.map((boundary) => ({
    name: boundary.name,
    isMatch: picomatch(boundary.globs, { dot: true }),
  }));

  /** @type {Map<string, { name: string, status: string | undefined, role: string | undefined, globs: string[], files: Array<{ path: string, hash: string }> }>} */
  const byName = new Map(
    ordered.map((boundary) => [
      boundary.name,
      {
        name: boundary.name,
        status: boundary.status,
        role: boundary.role,
        globs: boundary.globs,
        files: [],
      },
    ])
  );
  /** @type {Array<{ path: string, hash: string }>} */
  const unassigned = [];
  /** @type {Array<{ path: string, hash: string, boundaries: string[] }>} */
  const overlaps = [];

  for (const path of tracked) {
    const hash = createHash('sha256').update(readFileSync(join(repoPath, path))).digest('hex');
    const hits = [];
    for (const matcher of matchers) {
      if (matcher.isMatch(path)) hits.push(matcher.name);
    }
    if (hits.length === 0) unassigned.push({ path, hash });
    else if (hits.length === 1) byName.get(hits[0]).files.push({ path, hash });
    else overlaps.push({ path, hash, boundaries: hits });
  }

  for (const boundary of byName.values()) {
    boundary.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }
  unassigned.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  overlaps.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    generatedFrom: { repoPath, tracked: tracked.length },
    boundaries: [...byName.values()],
    unassigned,
    overlaps,
  };
}

function validateBoundary(boundary) {
  if (boundary == null || typeof boundary.name !== 'string' || boundary.name.trim() === '') {
    throw new Error('boundary name is required');
  }
  const globs = boundary.globs == null ? [] : boundary.globs;
  if (!Array.isArray(globs) || globs.some((glob) => typeof glob !== 'string')) {
    throw new Error(`boundary globs must be an array of strings: ${boundary.name}`);
  }
  return {
    name: boundary.name,
    status: boundary.status,
    role: boundary.role,
    globs: [...globs],
  };
}

function listTracked(repoPath) {
  // -z: without it git octal-escapes and quotes any non-ASCII path, and the
  // core would hash a file that does not exist under that spelling. The buffer
  // is raised because the default 1 MiB is a few tens of thousands of paths,
  // which real repositories in the fleet exceed.
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: repoPath,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.error?.message || '').trim();
    throw new Error(`git ls-files failed: ${detail || `exit ${result.status}`}`);
  }
  return result.stdout
    .split('\0')
    .filter((line) => line.length > 0)
    .map((line) => line.replaceAll('\\', '/'));
}
