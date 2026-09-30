import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { mapRepository } from '../core/index.js';
import { buildArtifact, serializeArtifact } from './artifact.js';
import { ignoredNotice, readBoundaryFile } from './boundary-file.js';
import { changesSince } from './changes.js';
import { compareArtifacts } from './check.js';
import { diffAgainstBase, diffJson, diffMarkdown, readBaseMap } from './diff.js';
import semver from 'semver';
import { FINDING_CODES, findingRemedy, findingSentence } from '../core/door-checks.js';
import { ENGINE } from './engine.js';
import { formatFailure, formatNotice } from './errors.js';
import { explainCommand } from './explain.js';
import { gapsCommand } from './gaps.js';
import { initCommand } from './init.js';
import { buildEnvelope, hitsFromStatistics } from './divergence.js';
import { buildPage } from './page.js';
import { buildStatistics, parametersFrom, serializeStatistics, statisticsProblem } from './statistics.js';
import { writeArtifactSync } from './write.js';
import { exportedRoot } from '../sidecar/map.js';

/**
 * @returns {number | Promise<number>} the exit code; `mcp` settles it when
 *   the host closes the server's input
 */
export function main(argv, cwd) {
  if (argv[0] === 'init') return initAt(cwd, argv.slice(1));
  if (argv[0] === 'map') return mapCommand(cwd, argv.slice(1));
  if (argv[0] === 'check') return checkCommand(cwd, argv.slice(1));
  if (argv[0] === 'explain') return explainAt(cwd, argv.slice(1));
  if (argv[0] === 'gaps') return gapsAt(cwd, argv.slice(1));
  if (argv[0] === 'diff') return diffCommand(cwd, argv.slice(1));
  if (argv[0] === 'mcp') return mcpCommand(cwd, argv.slice(1));
  process.stdout.write('atlas: expected atlas init, atlas map, atlas check, atlas explain, atlas gaps, atlas diff, or atlas mcp\nexit 2\n');
  return 2;
}

// stdout is the protocol channel from the first byte, so a usage error goes
// to stderr, where a host shows what a server logs.
async function mcpCommand(cwd, argv) {
  if (argv.length > 0) {
    process.stderr.write(`atlas: mcp takes no arguments, got ${argv[0]}\nexit 2\n`);
    return 2;
  }
  const { serve } = await import('../sidecar/server.js');
  await serve({ cwd });
  return 0;
}

function forCore(boundaries) {
  return boundaries.map((boundary) => ({
    name: boundary.name,
    globs: boundary.globs,
    role: boundary.role,
  }));
}

function initAt(cwd, argv) {
  const repo = repoRoot(cwd);
  if (!repo) return notARepository(cwd, 'init');
  return initCommand(repo, argv);
}

// Explain reads only the committed artifacts, so it needs the root to find
// them and the caller's place inside the tree to read a path the way they wrote it.
// A tree exported without its git history is answered from the atlas/ it
// holds, and says so.
function explainAt(cwd, argv) {
  const repo = repoRoot(cwd);
  if (repo) return explainCommand(repo, showPrefix(cwd), argv);
  const exported = exportedRoot(cwd);
  if (!exported) return notARepository(cwd, 'explain');
  return explainCommand(exported, exportedPrefix(exported, cwd), argv, { exported: true });
}

// Gaps, like explain, reads only the committed artifacts; the repository's
// name decides which house rules a suggestion cites.
function gapsAt(cwd, argv) {
  const repo = repoRoot(cwd);
  if (repo) return gapsCommand(repo, showPrefix(cwd), argv, { repository: repositoryName(repo) });
  const exported = exportedRoot(cwd);
  if (!exported) return notARepository(cwd, 'gaps');
  return gapsCommand(exported, exportedPrefix(exported, cwd), argv, { exported: true });
}

// Where the caller stands inside an exported tree, as git's --show-prefix
// gives it inside a checkout.
function exportedPrefix(root, cwd) {
  const inside = relative(root, cwd).replaceAll('\\', '/');
  return inside === '' ? '' : `${inside}/`;
}

export function mapCommand(cwd, argv = []) {
  const mapStarted = Date.now();
  const flags = parseMapArgs(argv);
  if (flags.error) return usage(flags.error);
  const repo = repoRoot(cwd);
  if (!repo) return notARepository(cwd, 'map');
  const origin = flags.name ?? repositoryName(repo);
  if (flags.divergence && !origin) return usage('atlas: --divergence needs an origin URL that names org/repo, or --name');
  let baseline = null;
  if (flags.baseline) {
    baseline = readBaseline(flags.baseline);
    if (!baseline) return usage('atlas: --baseline needs a directory holding a structure.json that is valid JSON');
  }
  let previous = null;
  if (flags.previous) {
    try {
      previous = JSON.parse(readFileSync(flags.previous, 'utf8'));
    } catch {
      return usage('atlas: --previous is not valid JSON');
    }
  }
  const boundary = readBoundaryFile(repo);
  if (!boundary.ok) return failBoundary(boundary);
  process.stdout.write(ignoredNotice(boundary));
  const commit = head(repo);
  if (!commit) return usage('atlas: git rev-parse HEAD failed');
  // The map is of the tracked tree, so it is the same on every clone. What
  // the working tree holds beside it is named, on stderr so a piped stdout
  // stays clean, since a flow that writes files and maps before staging them
  // would otherwise get a map without them and no word of it.
  process.stderr.write(untrackedWarning(repo));
  const { mapped, artifact, statistics, page } = buildMap({ repo, boundary, commit, origin, previous, baseline });
  writeMap(join(repo, 'atlas'), { artifact, statistics, page });
  let divergenceMs = null;
  if (flags.divergence) {
    const started = Date.now();
    const envelope = buildEnvelope({
      repo: origin,
      commit,
      generatedAt: statistics.generatedAt,
      sharedCommitFloor: statistics.parameters.sharedFloorUsed,
      hits: hitsFromStatistics(statistics, artifact),
      previous,
    });
    writeArtifactSync(flags.divergence, `${JSON.stringify(envelope, null, 2)}\n`);
    divergenceMs = Date.now() - started;
  }
  const unresolved = artifact.boundaries.reduce((sum, item) => sum + item.unresolvedSites, 0);
  process.stdout.write(
    [
      'atlas map',
      `  boundaries:  ${artifact.boundaries.length}`,
      `  unassigned:  ${artifact.unassigned.length}`,
      `  overlaps:    ${artifact.overlaps.length}`,
      `  edges:       ${artifact.edges.length}`,
      `  doors:       ${artifact.doors.length}`,
      `  unresolved:  ${unresolved}`,
      `  confidence:  ${mapped.importConfidence}`,
      'wrote atlas/structure.json',
      'wrote atlas/statistics.json',
      'wrote atlas/README.md',
      'wrote atlas/page.json',
      ...(divergenceMs == null ? [] : [`divergence: ${divergenceMs} ms`, `wrote ${flags.divergence}`]),
      `map took ${Date.now() - mapStarted} ms`,
      '',
    ].join('\n'),
  );
  return 0;
}

/**
 * A map of a checkout, made and not written: the structure, the statistics
 * and the page, as atlas map writes them to atlas/ and the sidecar's refresh
 * writes them to its cache. progress is told each stage as it starts.
 *
 * @param {{ repo: string, boundary: object, commit: string, origin?: string|null,
 *   previous?: object|null, baseline?: object|null, progress?: (phase: string) => void }} input
 */
export function buildMap({ repo, boundary, commit, origin = null, previous = null, baseline = null, progress = () => {} }) {
  progress('reading the tracked files');
  const mapped = mapRepository({ repoPath: repo, boundaries: forCore(boundary.boundaries) });
  const artifact = buildArtifact(mapped, commit);
  const committed = committedMap(repo);
  progress('reading the history');
  const statistics = buildStatistics({
    repo,
    commit,
    document: boundary,
    artifact,
    generatedAt: new Date().toISOString(),
    priorFloor: priorFloor(committed, previous, boundary),
  });
  progress('writing the page');
  const page = buildPage({
    structure: artifact,
    statistics,
    document: boundary,
    repoName: origin ?? manifestName(repo) ?? basename(repo),
    defaultBranch: defaultBranch(repo),
    changes: changesSince(committed ?? baseline, artifact, { repoPath: repo }),
  });
  return { mapped, artifact, statistics, page };
}

/** The four map files, each written whole or not at all. */
export function writeMap(dir, { artifact, statistics, page }) {
  writeArtifactSync(join(dir, 'structure.json'), serializeArtifact(artifact));
  writeArtifactSync(join(dir, 'statistics.json'), serializeStatistics(statistics));
  writeArtifactSync(join(dir, 'README.md'), page.markdown);
  writeArtifactSync(join(dir, 'page.json'), page.json);
}

export function checkCommand(cwd, argv = []) {
  const unknown = argv.find((arg) => arg !== '--strict');
  if (unknown !== undefined) return usage(`atlas: unknown argument ${unknown}; check takes --strict`);
  const strict = argv.includes('--strict');
  const repo = repoRoot(cwd);
  if (!repo) return notARepository(cwd, 'check');
  if (!existsSync(join(repo, 'atlas'))) {
    process.stdout.write('atlas: no atlas/ directory; nothing to check\n');
    return 0;
  }
  const boundary = readBoundaryFile(repo);
  if (!boundary.ok) return failBoundary(boundary);
  process.stdout.write(ignoredNotice(boundary));
  const structurePath = join(repo, 'atlas', 'structure.json');
  // A map on disk that git has never held is this run's own output, not a
  // committed map; comparing against it would report a match that means
  // nothing.
  if (existsSync(structurePath) && !committedAtHead(repo, 'atlas/structure.json')) {
    process.stdout.write('atlas check\n  no committed map; nothing to check against\n');
    return 0;
  }
  if (!existsSync(structurePath)) {
    process.stdout.write(
      formatFailure('ATLAS_NOT_MAPPED', ['atlas/structure.json is absent'], {
        whatToDo: 'run atlas map and commit atlas/',
      }),
    );
    return 1;
  }
  let committed;
  try {
    committed = JSON.parse(readFileSync(structurePath, 'utf8'));
  } catch {
    process.stdout.write(formatFailure('ATLAS_STRUCTURE_DRIFT', ['atlas/structure.json is not valid JSON']));
    return 1;
  }
  const mapped = mapRepository({ repoPath: repo, boundaries: forCore(boundary.boundaries) });
  const current = buildArtifact(mapped, head(repo) ?? '');
  // What the check says beside its verdict: the door checks' findings,
  // computed from the tree as it is now, and a map an older engine made.
  const notices = checkNotices(committed, current);
  const failure = compareArtifacts(committed, current, repo);
  if (failure) {
    process.stdout.write(formatFailure(failure.code, failure.details));
    return withNotices(notices, 1, strict);
  }
  const statisticsPath = join(repo, 'atlas', 'statistics.json');
  if (existsSync(statisticsPath)) {
    const problem = statisticsProblem(readFileSync(statisticsPath, 'utf8'));
    if (problem) {
      process.stdout.write(formatFailure('ATLAS_STATISTICS_UNDATED', [problem], {
        whatToDo: 'run atlas map and commit atlas/',
      }));
      return withNotices(notices, 1, strict);
    }
  }
  process.stdout.write('atlas check\n  boundaries match the committed map\n');
  return withNotices(notices, 0, strict);
}

/**
 * The notices of a check (docs/atlas-production.spec.md, Part 4): each
 * finding of a door check on the tree now, and the engine notice when the
 * committed map was made by an older Atlas or carries no stamp. Each is in
 * the error shape, without an exit line.
 */
function checkNotices(committed, current) {
  const out = [];
  const made = typeof committed.engine === 'string' ? committed.engine : null;
  if (made == null || (semver.valid(made) && semver.valid(ENGINE) && semver.lt(made, ENGINE))) {
    const said = made == null ? `the map carries no engine stamp; this is Atlas ${ENGINE}` : `the map was made by Atlas ${made}; this is ${ENGINE}`;
    out.push(formatNotice('ATLAS_MAP_ENGINE_OLDER', [said], 'run atlas map and commit atlas/'));
  }
  for (const door of current.doors ?? []) {
    for (const finding of door.findings ?? []) {
      const read = (finding.lines ?? []).map((entry) => (entry.line != null ? `${entry.file}:${entry.line}` : entry.file));
      out.push(formatNotice(FINDING_CODES[finding.rule], [findingSentence(door, finding), ...(read.length > 0 ? [`read from ${read.join(', ')}`] : [])], findingRemedy(finding)));
    }
  }
  return out;
}

// Prints the notices after the verdict. They leave the exit code as it is,
// unless --strict makes any notice fail the check.
function withNotices(notices, code, strict) {
  if (notices.length === 0) return code;
  process.stdout.write(`\nNotices\n${notices.join('')}`);
  if (!strict || code !== 0) return code;
  process.stdout.write(`--strict: ${notices.length === 1 ? 'a notice fails' : `${notices.length} notices fail`} the check\nexit 1\n`);
  return 1;
}

/**
 * The structural delta between the map committed at --base and a fresh map
 * of the working tree. Read-only, like the check: the working-side map is
 * built in memory and nothing under atlas/ is touched.
 */
export function diffCommand(cwd, argv = []) {
  const flags = parseDiffArgs(argv);
  if (flags.error) return usage(flags.error);
  const repo = repoRoot(cwd);
  if (!repo) return notARepository(cwd, 'diff');
  const boundary = readBoundaryFile(repo);
  if (!boundary.ok) return failBoundary(boundary);
  // stdout is the markdown or JSON a caller posts or parses as is, so the
  // notice goes to stderr where it is still seen but cannot corrupt either.
  process.stderr.write(ignoredNotice(boundary));
  const base = readBaseMap(repo, flags.base);
  if (!base.ok) {
    process.stdout.write(formatFailure('ATLAS_DIFF_NO_BASE', base.details, {
      exitCode: 2,
      whatToDo: 'fetch the base ref, or run atlas map on it',
    }));
    return 2;
  }
  const mapped = mapRepository({ repoPath: repo, boundaries: forCore(boundary.boundaries) });
  const current = buildArtifact(mapped, head(repo) ?? '');
  const diff = diffAgainstBase({ ...base, ref: flags.base }, current, { repoPath: repo });
  process.stdout.write(flags.json ? diffJson(diff) : diffMarkdown(diff));
  return 0;
}

function failBoundary(boundary) {
  const whatToDo = boundary.code === 'ATLAS_NO_BOUNDARY_FILE' ? 'run atlas init first' : 'fix the boundary file';
  process.stdout.write(formatFailure(boundary.code, boundary.details, { exitCode: 2, whatToDo }));
  return 2;
}

function usage(line) {
  process.stdout.write(`${line}\nexit 2\n`);
  return 2;
}

// Every command but mcp needs the repository it is run in; outside one it
// fails in the error shape, so the failure has a code a reader can look up.
// In a tree exported without its history the answer names what still works
// there: explain and gaps read its atlas/.
function notARepository(cwd, command) {
  const exported = command === 'explain' || command === 'gaps' ? null : exportedRoot(cwd);
  const where = exported ? '; here, in a tree exported without its history, atlas explain and atlas gaps answer from atlas/'
    : command === 'explain' || command === 'gaps' ? ', or in a directory holding atlas/structure.json' : '';
  process.stdout.write(formatFailure('ATLAS_NOT_A_REPOSITORY', [`${cwd} is in no git repository`], {
    exitCode: 2,
    whatToDo: `run atlas ${command} inside a git repository${where}`,
  }));
  return 2;
}

// --name and --baseline serve a caller that maps a copy it made itself, such
// as the fleet service: the copy's origin is a local path, so it cannot name
// the repository, and a repository with no committed map has no HEAD map for
// the page to say what changed since.
function parseMapArgs(argv) {
  let divergence = null;
  let previous = null;
  let name = null;
  let baseline = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--name') {
      name = argv[i + 1];
      if (!name || !REPOSITORY_NAME.test(name) || name.split('/').some((part) => /^\.+$/.test(part))) {
        return { error: 'atlas: --name needs owner/repo' };
      }
      i += 1;
    } else if (arg === '--baseline') {
      baseline = argv[i + 1];
      if (!baseline || baseline.startsWith('--')) return { error: 'atlas: --baseline needs a directory' };
      i += 1;
    } else if (arg === '--divergence') {
      divergence = argv[i + 1];
      if (!divergence || divergence.startsWith('--')) return { error: 'atlas: --divergence needs a path' };
      i += 1;
    } else if (arg === '--previous') {
      previous = argv[i + 1];
      if (!previous || previous.startsWith('--')) return { error: 'atlas: --previous needs a path' };
      i += 1;
    } else return { error: `atlas: unknown argument ${arg}` };
  }
  if (previous && !divergence) return { error: 'atlas: --previous requires --divergence' };
  return { divergence, previous, name, baseline };
}

const REPOSITORY_NAME = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

// A map written elsewhere, read the way committedMap reads HEAD's: the
// structure is required, the statistics only date it.
function readBaseline(dir) {
  let structure;
  try {
    structure = JSON.parse(readFileSync(join(dir, 'structure.json'), 'utf8'));
  } catch {
    return null;
  }
  if (!structure || typeof structure !== 'object' || Array.isArray(structure)) return null;
  let statistics = null;
  try {
    statistics = JSON.parse(readFileSync(join(dir, 'statistics.json'), 'utf8'));
  } catch {
    // Undated is still a baseline; the page names the commit instead of a date.
  }
  return { structure, statistics };
}

// No default base: origin/main is a guess about someone else's branch
// layout, and a wrong guess would print a delta against the wrong map.
function parseDiffArgs(argv) {
  let base = null;
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base') {
      base = argv[i + 1];
      if (!base || base.startsWith('-')) return { error: 'atlas: --base needs a ref, such as --base origin/main' };
      i += 1;
    } else if (arg === '--json') json = true;
    else return { error: `atlas: unknown argument ${arg}` };
  }
  if (!base) return { error: 'atlas: diff needs --base <ref>, such as --base origin/main' };
  return { base, json };
}

/** The org/repo a GitHub origin names, or null for any other origin or none. */
export function repositoryName(repo) {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) return null;
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\s*$/i.exec(result.stdout.trim());
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

/**
 * The branch a person edits the repository on: the remote's default, which a
 * clone records as origin/HEAD, then the branch checked out, then main. The
 * site's link to the boundary file points there, so a repository whose
 * default is not main is not sent to a branch it does not have.
 */
function defaultBranch(repo) {
  const remote = spawnSync('git', ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], { cwd: repo, encoding: 'utf8' });
  const named = remote.status === 0 ? /^refs\/remotes\/origin\/(.+)$/.exec(remote.stdout.trim()) : null;
  if (named) return named[1];
  const current = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: repo, encoding: 'utf8' });
  const branch = current.status === 0 ? current.stdout.trim() : '';
  return branch || 'main';
}

// A clone with no GitHub origin is named by its root manifest, so the page's
// title does not depend on the directory it was cloned into.
function manifestName(repo) {
  try {
    const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
    if (pkg && typeof pkg.name === 'string' && pkg.name.trim() !== '') return pkg.name.trim();
  } catch {
    // No readable root manifest; the directory name is the last resort.
  }
  return null;
}

// The previous map is the one committed at HEAD, never the working copy: the
// working copy is what this run overwrites, so reading it would make a second
// map at the same commit compare against the first and say something else.
function committedMap(repo) {
  const structure = committedJson(repo, 'atlas/structure.json');
  if (!structure) return null;
  return { structure, statistics: committedJson(repo, 'atlas/statistics.json') };
}

// The floor the previous map used, which the floor's hysteresis starts from:
// the statistics committed at HEAD, read as the changes are, or else the
// divergence report the weekly job passes as --previous, whose
// shared_commit_floor names the floor it was built on.
function priorFloor(committed, previous, document) {
  const floor = committed?.statistics?.parameters?.floor;
  if (floor === 'strong' || floor === 'fallen') return floor;
  const shared = previous?.shared_commit_floor;
  if (typeof shared !== 'number') return null;
  const parameters = parametersFrom(document);
  if (shared === parameters.shared) return 'strong';
  if (shared === parameters.fallenShared) return 'fallen';
  return null;
}

const UNTRACKED_NAMED = 5;

/**
 * The warning for the files in the working tree git does not track and no
 * ignore rule covers, or '' when there are none. atlas/ is left out: the map
 * reads nothing there, and a first map writes it into a tree that does not
 * track it yet.
 */
function untrackedWarning(repo) {
  const result = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) return '';
  const paths = result.stdout.split('\0').filter((path) => path !== '' && path !== 'atlas' && !path.startsWith('atlas/')).sort(cmpPaths);
  if (paths.length === 0) return '';
  const shown = paths.slice(0, UNTRACKED_NAMED);
  const rest = paths.length - shown.length;
  const named = rest > 0 ? `${shown.join(', ')} and ${rest} more`
    : shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
  const count = paths.length === 1 ? '1 untracked file' : `${paths.length} untracked files`;
  return formatNotice('ATLAS_MAP_UNTRACKED', [`${count} outside .gitignore: ${named}`], 'git add the files the map should hold and run atlas map again, or add them to .gitignore');
}

// Code-point order, so the names are listed alike on every platform.
function cmpPaths(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function committedAtHead(repo, path) {
  return spawnSync('git', ['cat-file', '-e', `HEAD:${path}`], { cwd: repo, encoding: 'utf8' }).status === 0;
}

function committedJson(repo, path) {
  const result = spawnSync('git', ['show', `HEAD:${path}`], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    // A committed file that is not JSON is not a map to compare against; the
    // check reports it as ATLAS_STRUCTURE_DRIFT.
    return null;
  }
}

function repoRoot(cwd) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function showPrefix(cwd) {
  const result = spawnSync('git', ['rev-parse', '--show-prefix'], { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function head(repo) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}
