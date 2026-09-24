import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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

// The ignore files a packager or a formatter reads, the line that keeps the
// map out of each, and when the file is written: a VS Code extension is
// packed by what .vscodeignore leaves, an npm package by what .npmignore
// leaves, both only when the manifest lists no files of its own; prettier
// --check . formats atlas/ unless .prettierignore says not to.
const IGNORES = [
  { file: '.vscodeignore', line: 'atlas/**', when: (pkg, present) => present && !Array.isArray(pkg?.files) },
  { file: '.npmignore', line: 'atlas/', when: (pkg, present) => present && !Array.isArray(pkg?.files) },
  { file: '.prettierignore', line: 'atlas/', when: (pkg) => usesPrettier(pkg) },
];
const COVERS = new Set(['atlas', 'atlas/', 'atlas/**', 'atlas/**/*', '/atlas', '/atlas/', '/atlas/**', '**/atlas', '**/atlas/', '**/atlas/**']);

/**
 * Adds the line that keeps atlas/ out of each ignore file the repository's
 * packaging or formatting reads, once: a line already covering atlas/ is
 * left as it is. A missing .prettierignore is made; a missing packaging
 * ignore file is not, since the manifest decides what ships without one.
 *
 * @param {string} repo
 * @returns {Array<{ file: string, line: string }>} what was added
 */
function keepMapOut(repo) {
  let pkg = null;
  try {
    pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  } catch {
    pkg = null;
  }
  const added = [];
  for (const ignore of IGNORES) {
    const path = join(repo, ignore.file);
    const present = existsSync(path);
    if (!ignore.when(pkg, present)) continue;
    const text = present ? readFileSync(path, 'utf8') : '';
    if (text.split(/\r?\n/).some((line) => COVERS.has(line.trim()))) continue;
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    writeArtifactSync(path, `${text}${text === '' || text.endsWith('\n') ? '' : eol}${ignore.line}${eol}`);
    added.push({ file: ignore.file, line: ignore.line });
  }
  return added;
}

function usesPrettier(pkg) {
  if (pkg == null || typeof pkg !== 'object') return false;
  const declared = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    .some((field) => pkg[field] != null && typeof pkg[field] === 'object' && Object.hasOwn(pkg[field], 'prettier'));
  const scripts = pkg.scripts != null && typeof pkg.scripts === 'object' ? Object.values(pkg.scripts) : [];
  return declared || scripts.some((script) => typeof script === 'string' && /\bprettier\b/.test(script));
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
  const added = keepMapOut(repo);
  lines.push(
    '',
    'wrote atlas/boundaries.yaml',
    ...(added.length > 0 ? [`added ${added.map((entry) => `${entry.line} to ${entry.file}`).join(', ')}`] : []),
    'next: run atlas map, then commit atlas/',
    '',
  );
  process.stdout.write(lines.join('\n'));
  return 0;
}
