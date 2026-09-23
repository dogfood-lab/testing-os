/**
 * atlas-brief.js — the blast radius an audit lane's brief carries when the
 * repository has an Atlas map (swarms/PROTOCOL.md, Phase 1 and Phase 5).
 *
 * For each lane: the "What breaks what" rows of the parts its domain holds
 * (who imports them, from production or only from tests, and which doors pass
 * through them), `atlas explain --json` for each entry point in its domain,
 * and the page's "What this map cannot see" list. A lane that knows who
 * depends on a file can weigh what a defect in it breaks; a lane that knows
 * what the map cannot see does not read a missing edge as proof there is none.
 *
 * The text is built from repository content, so the template neutralizes it
 * like any other untrusted input (renderBlastRadiusSection, lib/templates.js).
 * Nothing here is a gate: a map that cannot be read, or an explain that cannot
 * run, leaves a brief with less context, never a failed dispatch.
 */

import { readAtlasMap, mapCommitOf, runAtlas as defaultRunAtlas } from './atlas.js';
import { resolveExclusiveOwner } from './domains.js';

/** Entry points explained per lane; the rest are named, not explained. */
export const EXPLAIN_CAP = 5;
const LIST_CAP = 6;
const EXPLAIN_TIMEOUT_MS = 60 * 1000;

// The fields of `atlas explain --json` a lane reads; the per-file import
// lists and the order of work are left to `atlas explain <file>` itself, so
// five entry points cannot crowd out the rest of the brief.
const EXPLAIN_FIELDS = [
  'path', 'part', 'role', 'doors', 'importedBy', 'importedByTests', 'importedByTestFiles',
  'imports', 'reads', 'writes', 'ownTests', 'changesWith', 'unresolved', 'mapCommit',
];

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function capped(list) {
  if (!Array.isArray(list) || list.length <= LIST_CAP) return list;
  return [...list.slice(0, LIST_CAP), `… and ${list.length - LIST_CAP} more`];
}

function compactExplain(raw) {
  const out = {};
  for (const key of EXPLAIN_FIELDS) {
    if (raw[key] === undefined) continue;
    const value = raw[key];
    if (Array.isArray(value)) out[key] = capped(value);
    else if (value && typeof value === 'object') {
      out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, Array.isArray(v) ? capped(v) : v]));
    } else out[key] = value;
  }
  return out;
}

// Worded as the page words a list, so the brief reads like the map it quotes.
function namesOf(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function breaksRow(row, doorNames) {
  const clauses = [];
  clauses.push(row.importedBy.length > 0 ? `is imported by ${namesOf(row.importedBy)}` : 'is imported by no part in production');
  if (row.importedByTests.length > 0) clauses.push(`and only from tests by ${namesOf(row.importedByTests)}`);
  const doors = doorNames.length > 0
    ? `${doorNames.length} ${doorNames.length === 1 ? 'door passes' : 'doors pass'} through it (${namesOf(capped(doorNames))})`
    : 'no door passes through it';
  return `- **${row.name}** ${clauses.join(', ')}; ${doors}.`;
}

/**
 * The blast radius of every domain, keyed by domain name, or null when the
 * repository has no usable Atlas map.
 *
 * A domain's parts are the parts whose files it owns, so the rows follow the
 * frozen map whether it was drafted from Atlas or by hand. Each entry point is
 * explained once per call, however many lanes it would appear in.
 *
 * @param {object} input
 * @param {string} input.repoPath — the run's checkout
 * @param {Array<object>} input.domains — the frozen domain rows (globs parsed)
 * @param {string[]} input.domainNames — the lanes being briefed
 * @param {Function} [input.runAtlas] — the Atlas runner (lib/atlas.js#runAtlas)
 * @returns {Map<string, string>|null}
 */
export function buildBlastRadius({ repoPath, domains, domainNames, runAtlas = defaultRunAtlas }) {
  const map = readAtlasMap(repoPath);
  if (!map.adopted || !map.structure) return null;
  const { structure, page } = map;
  const commit = mapCommitOf(structure, page);

  const partsOf = new Map(domainNames.map((n) => [n, new Set()]));
  const entriesOf = new Map(domainNames.map((n) => [n, []]));
  for (const part of structure.boundaries ?? []) {
    for (const file of part.files ?? []) {
      const owner = resolveExclusiveOwner(domains, file.path);
      if (partsOf.has(owner)) partsOf.get(owner).add(part.name);
    }
    for (const entry of part.entryPoints ?? []) {
      const owner = resolveExclusiveOwner(domains, entry);
      if (entriesOf.has(owner)) entriesOf.get(owner).push(entry);
    }
  }

  const doorsThrough = new Map();
  for (const door of page?.doors ?? []) {
    for (const reach of door.reach ?? []) {
      if (!doorsThrough.has(reach.boundary)) doorsThrough.set(reach.boundary, []);
      doorsThrough.get(reach.boundary).push(door.name);
    }
  }
  const breaks = new Map((page?.breaks ?? []).filter((r) => r.kind === 'part').map((r) => [r.name, r]));

  const explained = new Map();
  function explain(file) {
    if (!explained.has(file)) {
      const result = runAtlas(['explain', file, '--json'], { cwd: repoPath, timeoutMs: EXPLAIN_TIMEOUT_MS });
      let value = null;
      let problem = null;
      if (result.status === 0) {
        try { value = compactExplain(JSON.parse(result.stdout)); } catch { problem = 'its output was not JSON'; }
      } else {
        problem = (result.stderr || result.stdout || `exit ${result.status}`).trim().split(/\r?\n/).slice(-1)[0];
      }
      explained.set(file, { value, problem });
    }
    return explained.get(file);
  }

  const limits = Array.isArray(page?.limits) ? page.limits : [];
  const sections = new Map();
  for (const name of domainNames) {
    const lines = [];
    lines.push(`Map: the committed Atlas map at ${commit ? String(commit).slice(0, 12) : 'an unrecorded commit'}. Every line here is derived from the repository by Atlas; no person wrote it.`);
    lines.push('');
    lines.push('### What breaks what, for the parts in this domain');
    lines.push('');
    const parts = [...partsOf.get(name)].sort(cmp);
    const rows = parts.filter((p) => breaks.has(p)).map((p) => breaksRow(breaks.get(p), doorsThrough.get(p) ?? []));
    if (rows.length > 0) lines.push(...rows);
    else lines.push(`No part in this domain is imported by another part${parts.length > 0 ? ` (parts: ${parts.join(', ')})` : ''}.`);

    const entries = [...new Set(entriesOf.get(name))].sort(cmp);
    lines.push('');
    lines.push('### Entry points in this domain');
    lines.push('');
    if (entries.length === 0) lines.push('None recorded: no manifest, workflow or file name marks one.');
    for (const entry of entries.slice(0, EXPLAIN_CAP)) {
      const { value, problem } = explain(entry);
      if (value) {
        lines.push(`\`${entry}\` (\`atlas explain ${entry} --json\`, the per-file lists and the order of work left out):`);
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(value, null, 2));
        lines.push('```');
      } else {
        lines.push(`\`${entry}\`: atlas explain could not run (${problem}); run \`atlas explain ${entry}\` yourself.`);
      }
      lines.push('');
    }
    if (entries.length > EXPLAIN_CAP) {
      const rest = entries.slice(EXPLAIN_CAP);
      lines.push(`${rest.length} more entry points not explained: ${rest.map((e) => `\`${e}\``).join(', ')}.`);
      lines.push('');
    }

    lines.push('### What this map cannot see');
    lines.push('');
    lines.push('An import, reader or writer the map cannot see is not in the rows above, and a defect can still travel along it. Read an absence as unknown, never as proof of none.');
    lines.push('');
    if (limits.length > 0) lines.push(...limits.map((l) => `- ${l}`));
    else lines.push('- The page records no limits.');
    sections.set(name, lines.join('\n'));
  }
  return sections;
}

export const BLAST_RADIUS_KV_PREFIX = 'blast_radius:wave:';

/** The kv key a wave's section for one lane is kept under, for `swarm resume`. */
export function blastRadiusKey(waveId, domainName) {
  return `${BLAST_RADIUS_KV_PREFIX}${waveId}:${domainName}`;
}
