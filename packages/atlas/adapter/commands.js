import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { mapRepository } from '../core/index.js';
import { buildArtifact, serializeArtifact } from './artifact.js';
import { ignoredNotice, readBoundaryFile } from './boundary-file.js';
import { compareArtifacts } from './check.js';
import { formatFailure } from './errors.js';
import { initCommand } from './init.js';
import { buildEnvelope, hitsFromStatistics } from './divergence.js';
import { buildPage } from './page.js';
import { buildStatistics, serializeStatistics, statisticsProblem } from './statistics.js';
import { writeArtifactSync } from './write.js';

export function main(argv, cwd) {
  if (argv[0] === 'init') return initAt(cwd, argv.slice(1));
  if (argv[0] === 'map') return mapCommand(cwd, argv.slice(1));
  if (argv[0] === 'check') return checkCommand(cwd);
  process.stdout.write('atlas: expected atlas init, atlas map, or atlas check\nexit 2\n');
  return 2;
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

export function mapCommand(cwd, argv = []) {
  const flags = parseMapArgs(argv);
  if (flags.error) return usage(flags.error);
  const repo = repoRoot(cwd);
  if (!repo) return usage('atlas: not a git repository');
  const origin = repositoryName(repo);
  if (flags.divergence && !origin) return usage('atlas: --divergence needs an origin URL that names org/repo');
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
  const statistics = buildStatistics({
    repo,
    commit,
    document: boundary,
    artifact,
    generatedAt: new Date().toISOString(),
  });
  const page = buildPage({
    structure: artifact,
    statistics,
    document: boundary,
    repoName: origin ?? manifestName(repo) ?? basename(repo),
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

function failBoundary(boundary) {
  const whatToDo = boundary.code === 'ATLAS_NO_BOUNDARY_FILE' ? 'run atlas init first' : 'fix the boundary file';
  process.stdout.write(formatFailure(boundary.code, boundary.details, { exitCode: 2, whatToDo }));
  return 2;
}

function usage(line) {
  process.stdout.write(`${line}\nexit 2\n`);
  return 2;
}

function parseMapArgs(argv) {
  let divergence = null;
  let previous = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--divergence') {
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
  return { divergence, previous };
}

function repositoryName(repo) {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) return null;
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\s*$/i.exec(result.stdout.trim());
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
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

function repoRoot(cwd) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function head(repo) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}
