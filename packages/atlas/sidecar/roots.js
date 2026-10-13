import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve, win32 } from 'node:path';
import { topLevel } from './git.js';
import { exportedRoot } from './map.js';

/**
 * The repositories one sidecar answers for, fixed when it starts
 * (docs/atlas-buildup.spec.md, slice AN). With `atlas mcp --repos <file>`
 * the file names them and nothing else is used. Without it they are the
 * repository Atlas was started in and the roots the client offered at
 * initialisation. A tool's `repo` argument names one of them by its path or
 * its folder's name, and anything else is refused.
 *
 * Paths are compared as real paths, with links and junctions resolved, and
 * on Windows without regard to case. A network path is never a root: a
 * share can change under a running server, and a junction can lead to one.
 */

/** The most repositories one server answers for. */
export const MAX_ROOTS = 32;

// How many roots a refusal names before it points to atlas_repos.
const NAMED = 8;

/**
 * Whether a path is on a network share or in a device namespace:
 * \\server\share, //server/share, \\?\ and \\.\ on Windows. Elsewhere a
 * network mount reads as a local path, and is compared as one.
 */
export function isNetworkPath(path, platform = process.platform) {
  return platform === 'win32' && /^[\\/]{2}/.test(String(path));
}

/** A path's form for comparison: Windows paths compare without case. */
export function pathKey(path, platform = process.platform) {
  return platform === 'win32' ? path.toLowerCase() : path;
}

function realOf(path) {
  try {
    return realpathSync.native(path);
  } catch {
    return null;
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function absolute(path, platform) {
  return platform === 'win32' ? win32.isAbsolute(path) : isAbsolute(path);
}

// The repository a real directory is in: the top of its git working tree,
// else the nearest directory above it holding atlas/structure.json, for a
// tree exported without its history. Each top is given as git or the walk
// gives it, and as its real path, which is what roots are compared by.
function repositoryOf(dir) {
  const top = topLevel(dir);
  if (top) {
    const real = realOf(top);
    return real ? { root: top, real, exported: false } : null;
  }
  const exported = exportedRoot(dir);
  if (exported) {
    const real = realOf(exported);
    return real ? { root: exported, real, exported: true } : null;
  }
  return null;
}

function entryOf(repository, from, platform) {
  return { ...repository, key: pathKey(repository.real, platform), name: basename(repository.real), from };
}

/**
 * The repository at or above a directory, as a root: how the working
 * directory and a client's root are taken, as before `repo` existed.
 *
 * @returns {null | { root: string, real: string, key: string, name: string, exported: boolean, from: string }}
 */
export function rootHolding(dir, from, { platform = process.platform } = {}) {
  if (isNetworkPath(dir, platform)) return null;
  const real = realOf(dir);
  if (!real || isNetworkPath(real, platform)) return null;
  const repository = repositoryOf(real);
  if (!repository || isNetworkPath(repository.real, platform)) return null;
  return entryOf(repository, from, platform);
}

/**
 * The roots a --repos file names: one path per line, absolute or relative
 * to the file's own directory, so an experiment can commit one list that
 * works on any machine. Blank lines and lines starting with # are skipped.
 * Each path must be the top of a git working tree, or of a tree exported
 * with its map, and no two may be one repository. Every problem is found
 * before the server starts, and none is skipped over.
 *
 * @param {string} file the file as given, relative to cwd or absolute
 * @returns {{ ok: true, roots: object[] } | { ok: false, error: { code: string, details: string[], whatToDo: string } }}
 */
export function readReposFile(file, { cwd = process.cwd(), platform = process.platform } = {}) {
  const path = resolve(cwd, file);
  const refuse = (details) => ({
    ok: false,
    error: {
      code: 'ATLAS_SIDECAR_REPOS_FILE',
      details: details.length > NAMED ? [...details.slice(0, NAMED), `and ${details.length - NAMED} more`] : details,
      whatToDo: 'list the top directory of each repository to answer for, one per line, absolute or relative to the file, and start atlas mcp again',
    },
  });
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    return refuse([`${file} cannot be read: ${err.code ?? err.message}`]);
  }
  const base = dirname(path);
  const roots = [];
  const problems = [];
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const at = `line ${index + 1}`;
    if (isNetworkPath(line, platform)) {
      problems.push(`${at}: ${line} is a network path, and a root must be on this machine`);
      return;
    }
    const given = absolute(line, platform) ? line : resolve(base, line);
    if (!existsSync(given) || !isDirectory(given)) {
      problems.push(`${at}: ${given} is not a directory`);
      return;
    }
    const real = realOf(given);
    if (!real || isNetworkPath(real, platform)) {
      problems.push(`${at}: ${given} resolves to a network path, and a root must be on this machine`);
      return;
    }
    const repository = repositoryOf(real);
    if (!repository) {
      problems.push(`${at}: ${given} is in no git repository and holds no atlas/structure.json`);
      return;
    }
    if (pathKey(repository.real, platform) !== pathKey(real, platform)) {
      problems.push(`${at}: ${given} is inside the repository at ${repository.real}; list the repository's top directory`);
      return;
    }
    const entry = { ...entryOf(repository, 'repos file', platform), line: index + 1 };
    const twin = roots.find((root) => root.key === entry.key);
    if (twin) {
      problems.push(`${at}: ${given} is the repository line ${twin.line} names`);
      return;
    }
    roots.push(entry);
  });
  if (problems.length > 0) return refuse(problems);
  if (roots.length === 0) return refuse([`${file} names no repository`]);
  if (roots.length > MAX_ROOTS) return refuse([`${file} names ${roots.length} repositories, and one server answers for at most ${MAX_ROOTS}`]);
  return { ok: true, roots };
}

/**
 * The roots of one call: the --repos list when the server was started with
 * one, else the repositories of the roots the client offered at
 * initialisation and the working directory's. They are in the order the
 * repository answered for was chosen before `repo` existed, so the first is
 * still that one: a client root in git, the working directory in git, then
 * the same two as trees exported without their history.
 *
 * @param {{ cwd: string, roots?: string[], repos?: object[] | null }} context
 */
export function rootsOf({ cwd, roots = [], repos = null }, { platform = process.platform } = {}) {
  if (repos) return repos;
  const found = [
    ...roots.map((dir) => rootHolding(dir, 'client root', { platform })),
    rootHolding(cwd, 'working directory', { platform }),
  ].filter(Boolean);
  const out = [];
  for (const entry of [...found.filter((root) => !root.exported), ...found.filter((root) => root.exported)]) {
    if (!out.some((root) => root.key === entry.key) && out.length < MAX_ROOTS) out.push(entry);
  }
  return out;
}

/**
 * The repository a call answers for, or why there is none it may answer for.
 *
 * Without `repo`: with a --repos list, the working directory's repository
 * when the list names it; without one, the first root, as before `repo`
 * existed. With `repo`: the root whose real path the absolute path resolves
 * to, or the one root with that folder name; anything else is refused.
 *
 * @param {{ cwd: string, roots?: string[], repos?: object[] | null }} context
 * @param {string | undefined} repo the call's repo argument
 * @returns {{ repo: object, count: number } | { error: { code: string, details: string[], whatToDo: string } }}
 *   count: how many roots there are, so an answer knows to name its repository
 */
export function chooseRoot(context, repo, { platform = process.platform } = {}) {
  const roots = rootsOf(context, { platform });
  const chosen = (root) => ({ repo: root, count: roots.length });
  const listed = () => {
    const names = roots.slice(0, NAMED).map((root) => `${root.name} (${root.real})`);
    const more = roots.length > NAMED ? `, and ${roots.length - NAMED} more` : '';
    return roots.length > 0 ? `the roots are ${names.join(', ')}${more}` : 'there are no roots';
  };
  const refuse = (detail, whatToDo = 'pass repo as one of the roots atlas_repos lists, by its path or its name') => ({
    error: { code: 'ATLAS_SIDECAR_REPO_NOT_ALLOWED', details: [detail, listed()], whatToDo },
  });

  if (repo === undefined) {
    if (!context.repos) {
      if (roots.length > 0) return chosen(roots[0]);
      return { error: notARepository(context) };
    }
    const own = rootHolding(context.cwd, 'working directory', { platform });
    const match = own && roots.find((root) => root.key === own.key);
    if (match) return chosen(match);
    return refuse('the directory atlas mcp was started in is not in a repository the --repos file names, and the call names no repo');
  }

  if (absolute(repo, platform)) {
    if (isNetworkPath(repo, platform)) return refuse(`${repo} is a network path, and a root is on this machine`);
    const real = realOf(repo);
    if (!real) return refuse(`${repo} does not exist`);
    if (isNetworkPath(real, platform)) return refuse(`${repo} resolves to a network path, and a root is on this machine`);
    const match = roots.find((root) => root.key === pathKey(real, platform));
    if (match) return chosen(match);
    return refuse(`${repo} is not one of the roots fixed when atlas mcp started`);
  }
  if (/[\\/]/.test(repo) || repo === '.' || repo === '..') {
    return refuse(`${repo} is a relative path`, 'pass repo as an absolute path or as a root\'s name, as atlas_repos lists them');
  }
  const named = roots.filter((root) => root.name === repo);
  if (named.length === 1) return chosen(named[0]);
  if (named.length > 1) {
    return {
      error: {
        code: 'ATLAS_SIDECAR_REPO_AMBIGUOUS',
        details: [`${named.length} roots are named ${repo}: ${named.slice(0, NAMED).map((root) => root.real).join(', ')}`],
        whatToDo: 'pass repo as the absolute path of the one meant',
      },
    };
  }
  return refuse(`no root is named ${repo}`);
}

function notARepository({ roots = [] }) {
  return {
    code: 'ATLAS_SIDECAR_NOT_A_REPOSITORY',
    details: [roots.length > 0 ? 'no client root and not the working directory is inside a git repository' : 'the working directory is not inside a git repository'],
    whatToDo: 'start atlas mcp in the repository to answer for, or offer it as a root; outside git, a directory holding atlas/structure.json is answered from as an exported tree',
  };
}
