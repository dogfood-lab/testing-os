import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const TOP_LEVEL = new Set(['summary', 'window', 'thresholds', 'machine_budget', 'boundaries']);
const BOUNDARY_FIELDS = new Set([
  'name',
  'globs',
  'status',
  'role',
  'reason',
  'why_from',
  'will_break',
  'will_break_from',
  'start_here',
  'rebaseline',
]);
const STATUSES = new Set(['proposed', 'accepted', 'deferred']);
const ROLES = new Set(['code', 'test', 'docs', 'config']);
const SOURCES = new Set(['derived', 'human']);

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
    boundaries: doc.boundaries.map((boundary) => ({
      name: boundary.name,
      globs: boundary.globs,
      status: boundary.status,
      role: boundary.role,
    })),
  };
}

function validate(doc) {
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) return 'the boundary file must be a mapping';
  for (const key of Object.keys(doc)) {
    if (!TOP_LEVEL.has(key)) return `unknown field ${key}`;
  }
  if (doc.summary != null && typeof doc.summary !== 'string') return 'summary must be a string';
  if (!Array.isArray(doc.boundaries)) return 'boundaries must be an array';
  const names = new Set();
  for (let i = 0; i < doc.boundaries.length; i += 1) {
    const boundary = doc.boundaries[i];
    const where = `boundaries[${i}]`;
    if (boundary == null || typeof boundary !== 'object' || Array.isArray(boundary)) return `${where} must be a mapping`;
    for (const key of Object.keys(boundary)) {
      if (!BOUNDARY_FIELDS.has(key)) return `${where}.${key} is not a boundary field`;
    }
    if (typeof boundary.name !== 'string' || boundary.name.trim() === '') return `${where}.name is required`;
    if (names.has(boundary.name)) return `${where}.name duplicates ${boundary.name}`;
    names.add(boundary.name);
    if (!Array.isArray(boundary.globs) || boundary.globs.some((glob) => typeof glob !== 'string')) {
      return `${where}.globs must be an array of strings`;
    }
    if (!STATUSES.has(boundary.status)) return `${where}.status must be proposed, accepted, or deferred`;
    if (!ROLES.has(boundary.role)) return `${where}.role must be code, test, docs, or config`;
    for (const field of ['reason', 'will_break', 'start_here', 'rebaseline']) {
      if (boundary[field] != null && typeof boundary[field] !== 'string') return `${where}.${field} must be a string`;
    }
    if (boundary.why_from != null && !SOURCES.has(boundary.why_from)) return `${where}.why_from must be derived or human`;
    if (boundary.will_break_from != null && !SOURCES.has(boundary.will_break_from)) {
      return `${where}.will_break_from must be derived or human`;
    }
  }
  return null;
}
