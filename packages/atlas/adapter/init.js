import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { mapRepository } from '../core/index.js';
import { readBoundaryFile } from './boundary-file.js';
import { formatFailure } from './errors.js';
import { listTracked, proposalSet } from './propose.js';
import { coveredBy, reasonTemplate, roleFor, willBreakTemplate } from './templates.js';
import { writeArtifactSync } from './write.js';

function inAtlas(path) {
  return path === 'atlas' || path.startsWith('atlas/');
}

function untouched(doc) {
  return doc.boundaries.every((boundary) => {
    const why = boundary.why_from == null || boundary.why_from === 'derived';
    const will = boundary.will_break_from == null || boundary.will_break_from === 'derived';
    return boundary.status === 'proposed' && why && will;
  });
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
    if (!untouched(existing)) return refuse(['a boundary is accepted, deferred, or marked human']);
  }
  const paths = listTracked(repo);
  if (!paths) {
    process.stdout.write('atlas: git ls-files failed\nexit 2\n');
    return 2;
  }
  const { source, proposals } = proposalSet(repo, paths);
  const seeded = proposals.map((proposal) => ({
    name: proposal.name,
    globs: [proposal.glob],
    status: 'proposed',
    role: 'code',
  }));
  const mapped = mapRepository({ repoPath: repo, boundaries: seeded });
  const byName = new Map(mapped.boundaries.map((boundary) => [boundary.name, boundary]));
  const roles = new Map();
  for (const proposal of proposals) {
    const boundary = byName.get(proposal.name);
    const files = (boundary?.files ?? []).map((file) => file.path).filter((path) => !inAtlas(path));
    roles.set(proposal.name, roleFor(files));
  }
  const boundaries = proposals.map((proposal) => {
    const boundary = byName.get(proposal.name);
    const files = (boundary?.files ?? []).map((file) => file.path).filter((path) => !inAtlas(path));
    const entryPoints = (boundary?.entryPoints ?? []).filter((path) => !inAtlas(path));
    const imports = [...new Set(mapped.edges.filter((edge) => edge.from === proposal.name).map((edge) => edge.to))];
    const fanIn = [...new Set(mapped.edges.filter((edge) => edge.to === proposal.name).map((edge) => edge.from))];
    const role = roles.get(proposal.name);
    return {
      name: proposal.name,
      globs: [proposal.glob],
      status: 'proposed',
      role,
      reason: reasonTemplate({ count: files.length, role, entryPoints, imports, importedBy: fanIn }),
      why_from: 'derived',
      will_break: willBreakTemplate({
        fanIn,
        coveredBy: coveredBy(proposal.name, files, fanIn.filter((name) => roles.get(name) === 'test')),
      }),
      will_break_from: 'derived',
    };
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
    lines.push(`    reason (derived): ${boundary.reason}`);
  }
  lines.push('', `unassigned  ${unassigned.length} files`);
  for (const file of unassigned) lines.push(`  ${file.path}`);
  if (mapped.overlaps.length > 0) {
    lines.push('', `overlaps  ${mapped.overlaps.length} files`);
    for (const overlap of mapped.overlaps) lines.push(`  ${overlap.path}`);
  }
  lines.push(
    '',
    'wrote atlas/boundaries.yaml with status: proposed',
    'next: edit each derived reason into your own words, set status: accepted, run atlas map, commit atlas/',
    '',
  );
  process.stdout.write(lines.join('\n'));
  return 0;
}
