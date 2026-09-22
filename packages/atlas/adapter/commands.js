import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapRepository } from '../core/index.js';
import { buildArtifact, serializeArtifact } from './artifact.js';
import { readBoundaryFile } from './boundary-file.js';
import { compareArtifacts } from './check.js';
import { formatFailure } from './errors.js';

export function main(argv, cwd) {
  if (argv[0] === 'map') return mapCommand(cwd);
  if (argv[0] === 'check') return checkCommand(cwd);
  process.stdout.write('atlas: expected `atlas map` or `atlas check`\nexit 2\n');
  return 2;
}

export function mapCommand(cwd) {
  const repo = repoRoot(cwd);
  if (!repo) return usage('atlas: not a git repository');
  const boundary = readBoundaryFile(repo);
  if (!boundary.ok) return failBoundary(boundary);
  const commit = head(repo);
  if (!commit) return usage('atlas: git rev-parse HEAD failed');
  const mapped = mapRepository({ repoPath: repo, boundaries: boundary.boundaries });
  const artifact = buildArtifact(mapped, commit);
  const bytes = serializeArtifact(artifact);
  writeFileSync(join(repo, 'atlas', 'structure.json'), bytes);
  const unresolved = artifact.boundaries.reduce((sum, item) => sum + item.unresolvedSites, 0);
  process.stdout.write(
    [
      'atlas map',
      `  boundaries:  ${artifact.boundaries.length}`,
      `  unassigned:  ${artifact.unassigned.length}`,
      `  overlaps:    ${artifact.overlaps.length}`,
      `  edges:       ${artifact.edges.length}`,
      `  unresolved:  ${unresolved}`,
      `  confidence:  ${mapped.importConfidence}`,
      'wrote atlas/structure.json',
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
  const mapped = mapRepository({ repoPath: repo, boundaries: boundary.boundaries });
  const current = buildArtifact(mapped, head(repo) ?? '');
  const failure = compareArtifacts(committed, current, repo);
  if (!failure) {
    process.stdout.write('atlas check\n  boundaries match the committed map\n');
    return 0;
  }
  process.stdout.write(formatFailure(failure.code, failure.details));
  return 1;
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
