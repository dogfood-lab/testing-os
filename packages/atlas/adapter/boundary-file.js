import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const TOP_LEVEL = new Set(['summary', 'window', 'thresholds', 'boundaries']);
const BOUNDARY_FIELDS = new Set(['name', 'globs', 'role', 'rebaseline']);
const ROLES = new Set(['code', 'test', 'docs', 'config', 'site', 'data']);

// Fields an older boundary file carried for the acceptance ladder. The page is
// written from the recorded facts now, so these are read past, not rejected:
// a file written before the change still maps.
const RETIRED_TOP_LEVEL = new Set(['machine_budget']);
const RETIRED_BOUNDARY = new Set(['status', 'reason', 'why_from', 'will_break', 'will_break_from', 'start_here']);

export function readBoundaryFile(repoPath) {
  const path = join(repoPath, 'atlas', 'boundaries.yaml');
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: false, code: 'ATLAS_NO_BOUNDARY_FILE', details: ['atlas/boundaries.yaml is absent'] };
    return { ok: false, code: 'ATLAS_BOUNDARY_FILE_INVALID', details: [`atlas/boundaries.yaml could not be read`] };
  }
  let doc;
  try {
    doc = parse(text);
  } catch {
    return { ok: false, code: 'ATLAS_BOUNDARY_FILE_INVALID', details: ['atlas/boundaries.yaml is not valid YAML'] };
  }
  const problem = validate(doc);
  if (problem) return { ok: false, code: 'ATLAS_BOUNDARY_FILE_INVALID', details: [problem] };
  return {
    ok: true,
    summary: typeof doc.summary === 'string' ? doc.summary : null,
    window: doc.window ?? null,
    thresholds: doc.thresholds ?? null,
    boundaries: doc.boundaries.map(carryBoundary),
    ignored: ignoredKeys(doc),
    personMarked: personMarked(doc),
  };
}

/** The one line a command prints when an older file's retired fields were read past. */
export function ignoredNotice(boundary) {
  if (!boundary.ok || boundary.ignored.length === 0) return '';
  return `atlas: ignored fields no longer read from atlas/boundaries.yaml: ${boundary.ignored.join(', ')}\n`;
}

function carryBoundary(boundary) {
  const carried = { name: boundary.name, globs: boundary.globs };
  if (boundary.role != null) carried.role = boundary.role;
  if (boundary.rebaseline != null) carried.rebaseline = boundary.rebaseline;
  return carried;
}

function ignoredKeys(doc) {
  const keys = new Set(Object.keys(doc).filter((key) => RETIRED_TOP_LEVEL.has(key)));
  for (const boundary of doc.boundaries) {
    for (const key of Object.keys(boundary)) if (RETIRED_BOUNDARY.has(key)) keys.add(key);
  }
  return [...keys].sort();
}

// An older file records a person's hand as a status past proposed or a field
// marked human. Init keeps its refusal to overwrite either.
function personMarked(doc) {
  return doc.boundaries.some((boundary) => (
    (boundary.status != null && boundary.status !== 'proposed')
    || boundary.why_from === 'human'
    || boundary.will_break_from === 'human'
  ));
}

function validate(doc) {
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) return 'the boundary file must be a mapping';
  for (const key of Object.keys(doc)) {
    if (!TOP_LEVEL.has(key) && !RETIRED_TOP_LEVEL.has(key)) return `unknown field ${key}`;
  }
  if (doc.summary != null && typeof doc.summary !== 'string') return 'summary must be a string';
  if (!Array.isArray(doc.boundaries)) return 'boundaries must be an array';
  const names = new Set();
  for (let i = 0; i < doc.boundaries.length; i += 1) {
    const boundary = doc.boundaries[i];
    const where = `boundaries[${i}]`;
    if (boundary == null || typeof boundary !== 'object' || Array.isArray(boundary)) return `${where} must be a mapping`;
    for (const key of Object.keys(boundary)) {
      if (!BOUNDARY_FIELDS.has(key) && !RETIRED_BOUNDARY.has(key)) return `${where}.${key} is not a boundary field`;
    }
    if (typeof boundary.name !== 'string' || boundary.name.trim() === '') return `${where}.name is required`;
    if (names.has(boundary.name)) return `${where}.name duplicates ${boundary.name}`;
    names.add(boundary.name);
    if (!Array.isArray(boundary.globs) || boundary.globs.some((glob) => typeof glob !== 'string')) {
      return `${where}.globs must be an array of strings`;
    }
    if (boundary.role != null && !ROLES.has(boundary.role)) return `${where}.role must be code, test, docs, config, site, or data`;
    if (boundary.rebaseline != null && typeof boundary.rebaseline !== 'string') return `${where}.rebaseline must be a string`;
  }
  return null;
}
