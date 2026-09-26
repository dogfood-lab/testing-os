import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { mapRepository } from '../core/index.js';
import { buildArtifact, serializeArtifact } from './artifact.js';
import { ignoredNotice, readBoundaryFile } from './boundary-file.js';
import { changesSince } from './changes.js';
import { compareArtifacts } from './check.js';
import { diffAgainstBase, diffJson, diffMarkdown, readBaseMap } from './diff.js';
import { formatFailure } from './errors.js';
import { explainCommand } from './explain.js';
import { initCommand } from './init.js';
import { buildEnvelope, hitsFromStatistics } from './divergence.js';
import { buildPage } from './page.js';
import { buildStatistics, parametersFrom, serializeStatistics, statisticsProblem } from './statistics.js';
import { writeArtifactSync } from './write.js';

/**
 * @returns {number | Promise<number>} the exit code; `mcp` settles it when
 *   the host closes the server's input
 */
export function main(argv, cwd) {
  if (argv[0] === 'init') return initAt(cwd, argv.slice(1));
  if (argv[0] === 'map') return mapCommand(cwd, argv.slice(1));
  if (argv[0] === 'check') return checkCommand(cwd);
  if (argv[0] === 'explain') return explainAt(cwd, argv.slice(1));
  if (argv[0] === 'diff') return diffCommand(cwd, argv.slice(1));
  if (argv[0] === 'mcp') return mcpCommand(cwd, argv.slice(1));
  process.stdout.write('atlas: expected atlas init, atlas map, atlas check, atlas explain, atlas diff, or atlas mcp\nexit 2\n');
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
  if (!repo) return usage('atlas: not a git repository');
  return initCommand(repo, argv);
}

// Explain reads only the committed artifacts, so it needs the root to find
// them and the caller's place inside the tree to read a path the way they wrote it.
function explainAt(cwd, argv) {
  const repo = repoRoot(cwd);
  if (!repo) return usage('atlas: not a git repository');
  return explainCommand(repo, showPrefix(cwd), argv);
}

export function mapCommand(cwd, argv = []) {
  const mapStarted = Date.now();
  const flags = parseMapArgs(argv);
  if (flags.error) return usage(flags.error);
  const repo = repoRoot(cwd);
  if (!repo) return usage('atlas: not a git repository');
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
  const mapped = mapRepository({ repoPath: repo, boundaries: forCore(boundary.boundaries) });
  const artifact = buildArtifact(mapped, commit);
  const committed = committedMap(repo);
  const statistics = buildStatistics({
    repo,
    commit,
    document: boundary,
    artifact,
    generatedAt: new Date().toISOString(),
    priorFloor: priorFloor(committed, previous, boundary),
  });
  const page = buildPage({
    structure: artifact,
    statistics,
    document: boundary,
    repoName: origin ?? manifestName(repo) ?? basename(repo),
    defaultBranch: defaultBranch(repo),
    changes: changesSince(committed ?? baseline, artifact, { repoPath: repo }),
  });
  const atlasDir = join(repo, 'atlas');
  writeArtifactSync(join(atlasDir, 'structure.json'), serializeArtifact(artifact));
  writeArtifactSync(join(atlasDir, 'statistics.json'), serializeStatistics(statistics));
  writeArtifactSync(join(atlasDir, 'README.md'), page.markdown);
  writeArtifactSync(join(atlasDir, 'page.json'), page.json);
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

export function checkCommand(cwd) {
  const repo = repoRoot(cwd);
  if (!repo) return usage('atlas: not a git repository');
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
  const failure = compareArtifacts(committed, current, repo);
  if (failure) {
    process.stdout.write(formatFailure(failure.code, failure.details));
    return 1;
  }
  const statisticsPath = join(repo, 'atlas', 'statistics.json');
  if (existsSync(statisticsPath)) {
    const problem = statisticsProblem(readFileSync(statisticsPath, 'utf8'));
    if (problem) {
      process.stdout.write(formatFailure('ATLAS_STATISTICS_UNDATED', [problem], {
        whatToDo: 'run atlas map and commit atlas/',
      }));
      return 1;
    }
  }
  process.stdout.write('atlas check\n  boundaries match the committed map\n');
  return 0;
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
  if (!repo) return usage('atlas: not a git repository');
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

function repositoryName(repo) {
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
