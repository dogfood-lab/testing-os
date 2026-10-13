import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, win32 } from 'node:path';
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
 * Paths are compared exactly as real paths, with links and junctions
 * resolved. On Windows the native real path carries each name's case as it
 * is on disk, so one directory always gives one string, and two that differ
 * only in case are two directories (a case-sensitive one can hold both). A
 * network path is never a root: a share can change under a running server,
 * and a junction can lead to one. Every root is kept as its real path, and
 * git runs there, never in the path it was given as.
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

// The native call, not realpathSync: on Windows it gives a mapped network
// drive as its share, so Z:\repo comes back as \\server\share\repo and is
// refused, where the JavaScript one keeps the drive letter (checked on the
// rig on 2026-10-13 with Z: mapped to \\localhost\C$). It also gives each
// name's case as it is on disk, which exact comparison relies on.
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

// A path that is not a root but would be one on a filesystem that ignores
// case: on Windows, a directory beside a root that differs only in case.
function caseTwin(roots, real, platform) {
  if (platform !== 'win32') return null;
  return roots.find((root) => root.real !== real && root.real.toLowerCase() === real.toLowerCase()) ?? null;
}

// The repository a real directory is: the top of the git working tree it is
// in, or the directory itself when it holds atlas/structure.json, for a tree
// exported without its history. An exported tree is never found by climbing
// to an ancestor (docs/atlas-production.spec.md, Part 1 item 4: a directory
// that holds atlas/structure.json), so a stray map above an offered
// directory cannot make a root of everything under it. Both are kept as
// their real path, where git runs.
function repositoryOf(real) {
  const top = topLevel(real);
  if (top) {
    const realTop = realOf(top);
    return realTop ? { root: realTop, real: realTop, exported: false } : null;
  }
  if (existsSync(join(real, 'atlas', 'structure.json'))) return { root: real, real, exported: true };
  return null;
}

function entryOf(repository, from) {
  return { ...repository, key: repository.real, name: basename(repository.real), from };
}

/**
 * The repository a directory is in, as a root: how the working directory
 * and a client's root are taken. A directory inside a git repository stands
 * for the whole repository, as before `repo` existed; a directory inside an
 * exported tree stands for nothing.
 *
 * @returns {null | { root: string, real: string, key: string, name: string, exported: boolean, from: string }}
 */
export function rootHolding(dir, from, { platform = process.platform } = {}) {
  if (isNetworkPath(dir, platform)) return null;
  const real = realOf(dir);
  if (!real || isNetworkPath(real, platform)) return null;
  const repository = repositoryOf(real);
  if (!repository || isNetworkPath(repository.real, platform)) return null;
  return entryOf(repository, from);
}

// The top of the exported tree a directory is inside, for a refusal's hint.
function exportedTopAbove(dir) {
  const real = realOf(dir);
  return real ? exportedRoot(real) : null;
}

/**
 * The roots a --repos file names: one path per line, absolute or relative
 * to the directory the file really is in (its links resolved), so an
 * experiment can commit one list that works on any machine. Blank lines and
 * lines starting with # are skipped; a path that starts with # is written
 * as ./#name. Each path must be the top of a git working tree, or a
 * directory holding atlas/structure.json, and no two may be one repository.
 * Every problem is found before the server starts, and none is skipped over.
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
  // A list reached through a link is read from where it really is, so its
  // relative lines name the same repositories however it was reached.
  const base = dirname(realOf(path) ?? path);
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
      const above = exportedRoot(real);
      problems.push(above
        ? `${at}: ${given} is inside the exported tree at ${above}; list the directory that holds atlas/structure.json`
        : `${at}: ${given} is in no git repository and holds no atlas/structure.json`);
      return;
    }
    if (repository.real !== real) {
      problems.push(`${at}: ${given} is inside the repository at ${repository.real}; list the repository's top directory`);
      return;
    }
    const entry = { ...entryOf(repository, 'repos file'), line: index + 1 };
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
 * The roots of one server, resolved once and kept: the --repos list when it
 * was started with one, else the repositories of the roots the client
 * offered at initialisation and the working directory's. Resolving them
 * again on a later call would let a junction retargeted after start change
 * which repository answers, so the server resolves them when the client's
 * roots are known and answers from these entries after that.
 *
 * The roots are in the order the repository answered for was chosen before
 * `repo` existed, so the first is still that one: a client root in git, the
 * working directory in git, then the same two as exported trees. The working
 * directory's own repository is kept apart, for a call with no repo under a
 * --repos list. Past MAX_ROOTS, the rest are dropped, and named so the
 * server can log them.
 *
 * @param {{ cwd: string, clientDirs?: string[], repos?: object[] | null }} input
 * @returns {{ roots: object[], own: object | null, fromFile: boolean, offered: number, dropped: string[], exportedAbove: string | null }}
 *   exportedAbove: the exported tree the working directory is inside, when it is in no repository
 */
export function fixRoots({ cwd, clientDirs = [], repos = null }, { platform = process.platform } = {}) {
  const own = rootHolding(cwd, 'working directory', { platform });
  const exportedAbove = own ? null : exportedTopAbove(cwd);
  if (repos) return { roots: repos, own, fromFile: true, offered: clientDirs.length, dropped: [], exportedAbove };
  const found = [...clientDirs.map((dir) => rootHolding(dir, 'client root', { platform })), own].filter(Boolean);
  const roots = [];
  const dropped = [];
  for (const entry of [...found.filter((root) => !root.exported), ...found.filter((root) => root.exported)]) {
    if (roots.some((root) => root.key === entry.key) || dropped.includes(entry.real)) continue;
    if (roots.length < MAX_ROOTS) roots.push(entry);
    else dropped.push(entry.real);
  }
  return { roots, own, fromFile: false, offered: clientDirs.length, dropped, exportedAbove };
}

/**
 * The repository a call answers for, or why there is none it may answer for.
 *
 * Without `repo`: with a --repos list, the working directory's repository
 * when the list names it; without one, the first root, as before `repo`
 * existed. With `repo`: the root whose real path the absolute path resolves
 * to exactly, or the one root with that folder name; anything else is
 * refused, a path that differs from a root only in case included.
 *
 * @param {ReturnType<typeof fixRoots>} fixed the server's roots
 * @param {string | undefined} repo the call's repo argument
 * @returns {{ repo: object, count: number } | { error: { code: string, details: string[], whatToDo: string } }}
 *   count: how many roots there are, so an answer knows to name its repository
 */
export function chooseRoot(fixed, repo, { platform = process.platform } = {}) {
  const { roots } = fixed;
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
    if (!fixed.fromFile) {
      if (roots.length > 0) return chosen(roots[0]);
      return { error: notARepository(fixed) };
    }
    const match = fixed.own && roots.find((root) => root.key === fixed.own.key);
    if (match) return chosen(match);
    return refuse('the directory atlas mcp was started in is not in a repository the --repos file names, and the call names no repo');
  }

  if (absolute(repo, platform)) {
    if (isNetworkPath(repo, platform)) return refuse(`${repo} is a network path, and a root is on this machine`);
    const real = realOf(repo);
    if (!real) return refuse(`${repo} does not exist`);
    if (isNetworkPath(real, platform)) return refuse(`${repo} resolves to a network path, and a root is on this machine`);
    const match = roots.find((root) => root.key === real);
    if (match) return chosen(match);
    const twin = caseTwin(roots, real, platform);
    if (twin) return refuse(`${repo} is ${real}, which differs from the root ${twin.real} only in case, and so is another directory`);
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

function notARepository({ offered, exportedAbove }) {
  if (exportedAbove) {
    return {
      code: 'ATLAS_SIDECAR_NOT_A_REPOSITORY',
      details: [`the working directory is inside the exported tree at ${exportedAbove}, and an exported tree is answered for only from the directory that holds atlas/structure.json`],
      whatToDo: `start atlas mcp in ${exportedAbove}, or offer it as a root`,
    };
  }
  return {
    code: 'ATLAS_SIDECAR_NOT_A_REPOSITORY',
    details: [offered > 0 ? 'no client root and not the working directory is inside a git repository' : 'the working directory is not inside a git repository'],
    whatToDo: 'start atlas mcp in the repository to answer for, or offer it as a root; outside git, a directory holding atlas/structure.json is answered from as an exported tree',
  };
}
