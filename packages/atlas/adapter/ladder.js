import { coveredBy, reasonTemplate, roleFor, willBreakTemplate } from './templates.js';

function blank(value) {
  return typeof value !== 'string' || value.trim() === '';
}

function names(edges, boundary, side) {
  const key = side === 'from' ? 'from' : 'to';
  const other = side === 'from' ? 'to' : 'from';
  return [...new Set(edges.filter((edge) => edge[key] === boundary).map((edge) => edge[other]))];
}

/**
 * Runs only after the structural comparison has passed. Proposed stays
 * lenient. Accepted must be a human sentence, not the sentence init would
 * write for these facts right now. Deferred needs a reason and nothing else.
 */
export function acceptanceFailures(boundaries, artifact) {
  const byName = new Map(artifact.boundaries.map((boundary) => [boundary.name, boundary]));
  const roles = new Map();
  for (const boundary of artifact.boundaries) {
    roles.set(boundary.name, roleFor(boundary.files.map((file) => file.path)));
  }
  const edges = artifact.edges ?? [];
  const accepted = [];
  const deferred = [];
  const ordered = [...boundaries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const boundary of ordered) {
    const live = byName.get(boundary.name);
    const paths = live ? live.files.map((file) => file.path) : [];
    const entryPoints = live ? live.entryPoints : [];
    const role = roles.get(boundary.name) ?? 'code';
    const imports = names(edges, boundary.name, 'from');
    const fanIn = names(edges, boundary.name, 'to');
    const derivedReason = reasonTemplate({
      count: paths.length,
      role,
      entryPoints,
      imports,
      importedBy: fanIn,
    });
    const derivedBreak = willBreakTemplate({
      fanIn,
      coveredBy: coveredBy(boundary.name, paths, fanIn.filter((name) => roles.get(name) === 'test')),
    });
    if (boundary.status === 'deferred') {
      if (blank(boundary.reason)) deferred.push(`${boundary.name} reason is empty`);
      continue;
    }
    if (boundary.status !== 'accepted') continue;
    if (blank(boundary.reason)) accepted.push(`${boundary.name} reason is empty`);
    else if (boundary.why_from === 'human' && boundary.reason.trim() === derivedReason.trim()) {
      accepted.push(`${boundary.name} reason still matches the derived sentence`);
    }
    if (boundary.why_from !== 'human') accepted.push(`${boundary.name} why_from is ${boundary.why_from ?? 'absent'}`);
    if (blank(boundary.will_break)) accepted.push(`${boundary.name} will_break is empty`);
    else if (boundary.will_break_from === 'human' && boundary.will_break.trim() === derivedBreak.trim()) {
      accepted.push(`${boundary.name} will_break still matches the derived sentence`);
    }
    if (boundary.will_break_from !== 'human') accepted.push(`${boundary.name} will_break_from is ${boundary.will_break_from ?? 'absent'}`);
    const pin = typeof boundary.start_here === 'string' ? boundary.start_here.trim() : '';
    if (!pin && entryPoints.length === 0) {
      accepted.push(`${boundary.name} start_here is empty and no entry point was derived`);
    }
  }
  if (accepted.length > 0) return { code: 'ATLAS_ACCEPTED_UNAUTHORED', details: accepted };
  if (deferred.length > 0) return { code: 'ATLAS_DEFERRED_WITHOUT_REASON', details: deferred };
  return null;
}
