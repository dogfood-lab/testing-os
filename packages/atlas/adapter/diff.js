import { spawnSync } from 'node:child_process';
import { compareStructures } from './changes.js';

/**
 * The structural delta between the map committed at a base ref and a fresh
 * map of the working tree: the page's "What changed since …" section, pointed
 * at the base of a pull request instead of at HEAD.
 *
 * Nothing here writes. The base side is read with `git show`, so a base ref
 * that exists only as a fetched remote-tracking branch is enough; the working
 * side is derived in memory by the caller.
 */

export const DIFF_HEADING = '## Atlas: what this change does to the map';

const STRUCTURE = 'atlas/structure.json';

function git(repo, args) {
  return spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/**
 * @param {string} repo
 * @param {string} ref
 * @returns {{ ok: true, commit: string, structure: object } | { ok: false, details: string[] }}
 */
export function readBaseMap(repo, ref) {
  const resolved = git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (resolved.status !== 0) return { ok: false, details: [`${ref} is not a commit in this clone`] };
  const commit = resolved.stdout.trim();
  const shown = git(repo, ['show', `${commit}:${STRUCTURE}`]);
  if (shown.status !== 0) {
    return { ok: false, details: [`${ref} (${commit.slice(0, 7)}) has no ${STRUCTURE}`] };
  }
  try {
    return { ok: true, commit, structure: JSON.parse(shown.stdout) };
  } catch {
    return { ok: false, details: [`${STRUCTURE} at ${ref} (${commit.slice(0, 7)}) is not valid JSON`] };
  }
}

/**
 * @param {{ ref: string, commit: string, structure: object }} base
 * @param {object} current the structure derived from the working tree
 * @param {{ repoPath?: string }} [options] repoPath lets the new-unassigned
 *   rule read file sizes the way the check does
 */
export function diffAgainstBase(base, current, { repoPath = null } = {}) {
  const compared = compareStructures(base.structure, current, {
    repoPath,
    since: { commit: base.commit, generatedAt: null },
  });
  return {
    base: { commit: base.commit, ref: base.ref },
    fileCounts: compared.fileCounts,
    items: compared.items,
    unchanged: compared.unchanged,
  };
}

// Worded as the page words its own section: nothing structural is one line,
// anything else is one bullet per item with the counts line last.
export function diffMarkdown(diff) {
  const body = diff.unchanged
    ? diff.items.map((item) => item.sentence).join(' ')
    : diff.items.map((item) => `- ${item.sentence}`).join('\n');
  return `${DIFF_HEADING}\n\n${body}\n`;
}

export function diffJson(diff) {
  return `${JSON.stringify(diff, null, 2)}\n`;
}
