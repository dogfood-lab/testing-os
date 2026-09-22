/**
 * The repository's tracked file set.
 *
 * Repo-hygiene scanners that gate CI have to agree with CI about what "the
 * repository" is, and a recursive directory listing does not. A developer's
 * working copy carries things git deliberately does not track: gitignored
 * swarm scratch directories under `swarms/`, app-managed agent worktrees
 * under `.claude/worktrees/` that Windows can leave on disk after a failed
 * `git worktree remove`, half-finished spikes. Scanners that walked the
 * filesystem read all of it and reported defects for text that is not in the
 * repository at all — red on a developer machine, green in CI, because a
 * clean checkout has none of the pollution. A gate that reds on scratch is a
 * gate people learn to skip.
 *
 * `git ls-files` is the authority on that question, so it is what the
 * scanners enumerate. Two consequences worth stating plainly:
 *
 *   - A tracked file with uncommitted modifications is still listed, and
 *     callers read its WORKING-TREE contents, not the indexed blob. An edit
 *     in progress is scanned exactly as a committed one is.
 *   - A brand-new file that has not been `git add`-ed yet is invisible until
 *     it is added. That is already how CI behaves, since CI only ever sees
 *     committed content.
 */

import { execFileSync } from 'node:child_process';

/**
 * List the paths git tracks under `rootDir`.
 *
 * Paths come back relative to `rootDir` with forward slashes on every
 * platform — `-z` also means git emits them verbatim rather than C-quoting
 * the ones carrying unusual bytes, so no unescaping step is needed.
 *
 * Throws when `rootDir` is not inside a git work tree. That is deliberate:
 * the alternative (silently returning nothing, or silently falling back to a
 * directory listing) would turn a misconfigured scan into either a vacuous
 * pass or the very defect this module exists to remove.
 *
 * @param {string} rootDir - Absolute path to a directory inside a git work tree.
 * @returns {string[]} Tracked paths, relative to `rootDir`, forward-slashed.
 */
export function listTrackedFiles(rootDir) {
  let stdout;
  try {
    stdout = execFileSync('git', ['-C', rootDir, 'ls-files', '-z', '--cached'], {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    throw new Error(
      `tracked-files: \`git ls-files\` failed in ${rootDir}. ` +
      `Hint: the scanners enumerate tracked files, so the path must be inside a git work tree ` +
      `and \`git\` must be on PATH.`,
      { cause },
    );
  }
  return stdout.split('\0').filter((p) => p.length > 0);
}
