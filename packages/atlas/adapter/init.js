import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { mapRepository } from '../core/index.js';
import { readBoundaryFile } from './boundary-file.js';
import { formatFailure } from './errors.js';
import { listTracked, proposalSet } from './propose.js';
import { roleFor } from './templates.js';
import { writeArtifactSync } from './write.js';

function inAtlas(path) {
  return path === 'atlas' || path.startsWith('atlas/');
}

// A person's hand in the file is the summary, or in an older file a status or
// a field marked human. Force regenerates a file with neither.
function untouched(doc) {
  const summary = typeof doc.summary === 'string' ? doc.summary.trim() : '';
  return summary === '' && !doc.personMarked;
}

function refuse(details) {
  process.stdout.write(
    formatFailure('ATLAS_INIT_WOULD_OVERWRITE', details, {
      exitCode: 2,
      whatToDo: 'edit atlas/boundaries.yaml by hand; init will not overwrite it',
    }),
  );
  return 2;
}

export function initCommand(repo, argv) {
  const force = argv.includes('--force');
  const file = join(repo, 'atlas', 'boundaries.yaml');
  if (existsSync(file)) {
    const existing = readBoundaryFile(repo);
    if (!force) return refuse(existing.ok ? ['atlas/boundaries.yaml already exists'] : existing.details);
    if (!existing.ok) {
      process.stdout.write(formatFailure(existing.code, existing.details, { exitCode: 2, whatToDo: 'fix the boundary file' }));
      return 2;
    }
    if (!untouched(existing)) return refuse(['a person has written the summary or marked a boundary']);
  }
  const paths = listTracked(repo);
  if (!paths) {
    process.stdout.write('atlas: git ls-files failed\nexit 2\n');
    return 2;
  }
  const { source, proposals } = proposalSet(repo, paths);
  const seeded = proposals.map((proposal) => ({ name: proposal.name, globs: [proposal.glob], role: 'code' }));
  const mapped = mapRepository({ repoPath: repo, boundaries: seeded });
  const byName = new Map(mapped.boundaries.map((boundary) => [boundary.name, boundary]));
  const boundaries = proposals.map((proposal) => {
    const live = byName.get(proposal.name);
    const files = (live?.files ?? []).map((file) => file.path).filter((path) => !inAtlas(path));
    return { name: proposal.name, globs: [proposal.glob], role: roleFor(files, { manifest: live?.holdsManifest === true }) };
  });
  mkdirSync(join(repo, 'atlas'), { recursive: true });
  const text = stringify({ summary: '', boundaries });
  writeArtifactSync(file, text.endsWith('\n') ? text : `${text}\n`);
  const unassigned = mapped.unassigned.filter((file) => !inAtlas(file.path)).sort((a, b) => (a.path < b.path ? -1 : 1));
  const lines = ['atlas init', `proposed ${boundaries.length} boundaries from ${source}`, ''];
  for (const boundary of boundaries) {
    const live = byName.get(boundary.name);
    const entryPoints = (live?.entryPoints ?? []).filter((path) => !inAtlas(path)).sort();
    const count = (live?.files ?? []).filter((file) => !inAtlas(file.path)).length;
    lines.push(`  ${boundary.name}  ${boundary.role}  ${count} files  entry: ${entryPoints.length === 0 ? 'none' : entryPoints.join(', ')}`);
  }
  lines.push('', `unassigned  ${unassigned.length} files`);
  for (const file of unassigned) lines.push(`  ${file.path}`);
  if (mapped.overlaps.length > 0) {
    lines.push('', `overlaps  ${mapped.overlaps.length} files`);
    for (const overlap of mapped.overlaps) lines.push(`  ${overlap.path}`);
  }
  lines.push(
    '',
    'wrote atlas/boundaries.yaml',
    'next: run atlas map, then commit atlas/',
    '',
  );
  process.stdout.write(lines.join('\n'));
  return 0;
}
