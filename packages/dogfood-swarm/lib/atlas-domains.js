/**
 * atlas-domains.js — draft the swarm's domain map from a repository's Atlas
 * parts instead of the hand template.
 *
 * The rule (swarms/PROTOCOL.md, "Domain Agent Assignments"): parts are merged
 * until the map has the requested number of domains (five by default, ten at
 * most), the smallest part going first and joining the part that imports it
 * most. A part whose role is `test` joins the part it imports unless the
 * coordinator asks for one tests domain. Every domain's globs are the union of
 * its parts' globs, so exclusivity is inherited from the boundary file rather
 * than re-argued here; `verifyDomainCoverage` then proves it against the files
 * git tracks, which is the population the map has to cover.
 *
 * Two kinds of tracked file are not in any part, and each gets an owner:
 *   - atlas/ itself. The map describes the tree minus its own directory, and
 *     the page is regenerated with `atlas map` after the coordinator's serial
 *     verify, never hand-edited by a lane, so it becomes one `coordinator`
 *     domain: exclusive, and never an agent seat.
 *   - files the committed map lists as unassigned. They join the domain that
 *     owns the most files in their nearest directory, as a literal-path glob,
 *     and the draft says so. A tracked file that is in no part and not in the
 *     committed unassigned list is new since the map; the draft refuses and
 *     names it, since `atlas check` would fail on it anyway.
 */

import { minimatch } from 'minimatch';
import { isSafeDomainName } from './worktree.js';
import { ATLAS_VERSION, listTrackedFiles, mapCommitOf, readAtlasMap } from './atlas.js';

export const DEFAULT_DOMAIN_TARGET = 5;
export const MIN_DOMAIN_TARGET = 1;
export const MAX_DOMAIN_TARGET = 10;
export const ATLAS_MAP_DOMAIN = 'atlas-map';
export const TESTS_DOMAIN = 'tests';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function inAtlasDir(path) {
  return path === 'atlas' || path.startsWith('atlas/');
}

function matchesAny(globs, file) {
  return globs.some((glob) => minimatch(file, glob, { dot: true }));
}

/**
 * @param {object} input
 * @param {object} input.structure — the committed atlas/structure.json
 * @param {string[]} input.tracked — every path git tracks
 * @param {number} [input.target] — domains to merge down to (default 5, max 10)
 * @param {boolean} [input.testsDomain] — keep test-role parts as one domain
 * @returns {{ domains: Array<{ name: string, globs: string[], ownership_class: string, description: string, parts: string[], files: number }>, placed: Array<{ file: string, domain: string }>, merges: Array<{ parts: string[], into: string, why: string }> }}
 */
export function deriveDomainsFromAtlas({ structure, tracked, target = DEFAULT_DOMAIN_TARGET, testsDomain = false }) {
  if (!Number.isInteger(target) || target < MIN_DOMAIN_TARGET || target > MAX_DOMAIN_TARGET) {
    throw new Error(`--domains must be an integer from ${MIN_DOMAIN_TARGET} to ${MAX_DOMAIN_TARGET}; got ${target}`);
  }
  const parts = (structure.boundaries ?? []).map((b) => ({
    name: b.name,
    globs: [...(b.globs ?? [])],
    role: b.role ?? null,
    files: Array.isArray(b.files) ? b.files.length : 0,
    roster: Array.isArray(b.files) ? b.files.map((f) => f.path) : [],
  }));
  if (parts.length === 0) throw new Error('atlas/structure.json names no parts; run `atlas map`');
  if ((structure.overlaps ?? []).length > 0) {
    const first = structure.overlaps.slice(0, 5).map((o) => `${o.path} (${(o.boundaries ?? []).join(', ')})`);
    throw new Error(`the committed Atlas map has files in two parts: ${first.join('; ')}; fix atlas/boundaries.yaml and run \`atlas map\``);
  }

  const edges = (structure.edges ?? []).filter((e) => e.from !== e.to);
  let groups = parts.map((p) => ({
    parts: [p.name],
    globs: [...p.globs],
    files: p.files,
    // The largest member names the group and lends it its role, so the name a
    // lane sees is the part most of its files are in.
    lead: p.name,
    leadFiles: p.files,
    role: p.role,
  }));
  const merges = [];

  const edgeCount = (fromGroup, toGroup, pred) => edges.filter((e) =>
    fromGroup.parts.includes(e.from) && toGroup.parts.includes(e.to) && pred(e)).length;

  function mergeInto(small, big, why) {
    merges.push({ parts: [...small.parts].sort(cmp), into: big.lead, why });
    big.parts.push(...small.parts);
    big.globs.push(...small.globs);
    big.files += small.files;
    if (small.leadFiles > big.leadFiles || (small.leadFiles === big.leadFiles && small.lead < big.lead)) {
      big.lead = small.lead;
      big.leadFiles = small.leadFiles;
      big.role = small.role;
    }
    groups = groups.filter((g) => g !== small);
  }

  // Tests first: a test part is read against the code it tests.
  const testGroups = groups.filter((g) => g.role === 'test').sort((a, b) => cmp(a.lead, b.lead));
  if (testsDomain && testGroups.length > 0) {
    const [first, ...rest] = testGroups;
    for (const g of rest) mergeInto(g, first, 'one tests domain was asked for');
    first.forcedName = TESTS_DOMAIN;
  } else {
    for (const t of testGroups) {
      const candidates = groups.filter((g) => g !== t && g.role !== 'test')
        .map((g) => ({ g, n: edgeCount(t, g, () => true) }))
        .filter((c) => c.n > 0)
        .sort((a, b) => b.n - a.n || a.g.files - b.g.files || cmp(a.g.lead, b.g.lead));
      if (candidates.length > 0) mergeInto(t, candidates[0].g, `tests ${candidates[0].g.lead}`);
    }
  }

  while (groups.length > target) {
    const small = [...groups]
      .filter((g) => !g.forcedName)
      .sort((a, b) => a.files - b.files || cmp(a.lead, b.lead))[0];
    if (!small) break;
    // A tests domain that was asked for holds tests only, so it takes no part.
    const takers = groups.filter((g) => g !== small && !g.forcedName);
    const scored = (takers.length > 0 ? takers : groups.filter((g) => g !== small)).map((g) => ({
      g,
      score: [
        edgeCount(g, small, (e) => !e.fromTests),
        edgeCount(g, small, (e) => !!e.fromTests),
        edgeCount(small, g, () => true),
        g.role != null && g.role === small.role ? 1 : 0,
        -g.files,
      ],
    }));
    scored.sort((a, b) => {
      for (let i = 0; i < a.score.length; i++) {
        if (a.score[i] !== b.score[i]) return b.score[i] - a.score[i];
      }
      return cmp(a.g.lead, b.g.lead);
    });
    const best = scored[0];
    mergeInto(small, best.g, whyMerged(best.score, best.g.lead));
  }

  const domains = nameGroups(groups).map((g) => ({
    name: g.name,
    globs: [...new Set(g.globs)],
    ownership_class: 'owned',
    description: `Atlas parts: ${[...g.parts].sort(cmp).join(', ')}`,
    parts: [...g.parts].sort(cmp),
    files: g.files,
  }));

  const placed = placeUnassigned(structure, parts, domains);

  const coordinatorDomain = {
    name: uniqueName(ATLAS_MAP_DOMAIN, new Set(domains.map((d) => d.name))),
    globs: ['atlas/**'],
    ownership_class: 'coordinator',
    description: 'The committed Atlas map; regenerated with `atlas map` by the coordinator, never by a lane',
    parts: [],
    files: tracked.filter(inAtlasDir).length,
  };
  const all = [...domains, coordinatorDomain].sort((a, b) => cmp(a.name, b.name));

  const coverage = verifyDomainCoverage(all, tracked);
  if (coverage.unowned.length > 0 || coverage.multiOwned.length > 0) {
    throw new Error(coverageMessage(coverage));
  }
  return { domains: all, placed, merges };
}

function whyMerged(score, into) {
  if (score[0] > 0) return `imported by ${into}`;
  if (score[1] > 0) return `imported by ${into} from tests`;
  if (score[2] > 0) return `imports ${into}`;
  if (score[3] > 0) return `same role as ${into}`;
  return `no import either way; ${into} was the smallest domain`;
}

/**
 * Read the repository's committed map and draft the domain map from it.
 * Throws when the repository has not adopted Atlas or its map cannot be used;
 * callers that fall back to the hand template catch and say so.
 *
 * @param {string} repoPath
 * @param {{ target?: number, testsDomain?: boolean }} [opts]
 * @returns {{ domains: object[], placed: object[], merges: object[], lineage: object }}
 */
export function draftDomainsFromAtlas(repoPath, opts = {}) {
  const map = readAtlasMap(repoPath);
  if (!map.adopted) throw new Error('the repository has no atlas/boundaries.yaml; the hand template applies');
  if (map.problem) throw new Error(map.problem);
  const target = opts.target ?? DEFAULT_DOMAIN_TARGET;
  const testsDomain = !!opts.testsDomain;
  const derived = deriveDomainsFromAtlas({
    structure: map.structure,
    tracked: listTrackedFiles(repoPath),
    target,
    testsDomain,
  });
  const lineage = {
    source: 'atlas',
    atlasVersion: ATLAS_VERSION,
    mapCommit: mapCommitOf(map.structure, map.page),
    parts: (map.structure.boundaries ?? []).length,
    target,
    testsDomain,
    domains: derived.domains.map((d) => ({ name: d.name, parts: d.parts, globs: d.globs, ownership_class: d.ownership_class })),
    placed: derived.placed,
  };
  return { ...derived, lineage };
}

/** The `created` event reason a draft from Atlas parts is saved with. */
export function atlasDraftReason(draft) {
  const commit = draft.lineage.mapCommit ? String(draft.lineage.mapCommit).slice(0, 12) : 'an uncommitted map';
  return `Drafted from ${draft.lineage.parts} Atlas parts at ${commit}`;
}

/**
 * Whether the current draft is still the one Atlas produced. A hand edit
 * after the draft is allowed; the freeze records that it happened.
 */
export function draftMatchesLineage(domains, lineage) {
  const key = (list) => JSON.stringify([...list]
    .map((d) => [d.name, [...d.globs].sort(), d.ownership_class])
    .sort((a, b) => cmp(a[0], b[0])));
  return key(domains) === key(lineage.domains ?? []);
}

function sanitizeName(raw) {
  const cleaned = String(raw).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  return cleaned || 'part';
}

function uniqueName(base, taken) {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base.slice(0, 60)}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function nameGroups(groups) {
  const taken = new Set([ATLAS_MAP_DOMAIN]);
  return [...groups]
    .sort((a, b) => b.files - a.files || cmp(a.lead, b.lead))
    .map((g) => {
      const name = uniqueName(g.forcedName ?? sanitizeName(g.lead), taken);
      if (!isSafeDomainName(name)) throw new Error(`derived domain name ${JSON.stringify(name)} is not a safe domain name`);
      taken.add(name);
      return { ...g, name };
    });
}

// The nearest directory with owned files decides, and within it the domain
// owning the most of them; ties go to the domain name, so the same map always
// places a file the same way.
function placeUnassigned(structure, parts, domains) {
  const ownerOfPart = new Map();
  for (const d of domains) for (const p of d.parts) ownerOfPart.set(p, d);
  const roster = [];
  for (const p of parts) for (const path of p.roster) roster.push({ path, domain: ownerOfPart.get(p.name) });

  const placed = [];
  for (const file of (structure.unassigned ?? []).map((u) => u.path).filter((p) => !inAtlasDir(p)).sort(cmp)) {
    let dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
    let chosen = null;
    for (;;) {
      const prefix = dir ? `${dir}/` : '';
      const counts = new Map();
      for (const r of roster) {
        if (!r.path.startsWith(prefix)) continue;
        counts.set(r.domain, (counts.get(r.domain) ?? 0) + 1);
      }
      if (counts.size > 0) {
        chosen = [...counts.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0].name, b[0].name))[0][0];
        break;
      }
      if (!dir) break;
      dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
    }
    if (!chosen) chosen = [...domains].sort((a, b) => b.files - a.files || cmp(a.name, b.name))[0];
    chosen.globs.push(escapeGlob(file));
    chosen.files += 1;
    placed.push({ file, domain: chosen.name });
  }
  return placed;
}

// A literal path used as a glob must not be read as a pattern.
function escapeGlob(path) {
  return path.replace(/[*?[\]{}()!+@\\]/g, (ch) => `\\${ch}`);
}

/**
 * Prove a domain map exclusive and complete over `tracked`: every tracked
 * file is matched by exactly one exclusive domain's globs. Membership, not
 * specificity arbitration, is the test, because the derived map claims more
 * than arbitration needs: no file is matched by two domains at all.
 *
 * @param {Array<{ name: string, globs: string[], ownership_class: string }>} domains
 * @param {string[]} tracked
 * @returns {{ unowned: string[], multiOwned: Array<{ file: string, domains: string[] }>, checked: number }}
 */
export function verifyDomainCoverage(domains, tracked) {
  const exclusive = domains.filter((d) => d.ownership_class === 'owned' || d.ownership_class === 'coordinator');
  const unowned = [];
  const multiOwned = [];
  for (const file of tracked) {
    const owners = exclusive.filter((d) => matchesAny(d.globs, file)).map((d) => d.name);
    if (owners.length === 0) unowned.push(file);
    else if (owners.length > 1) multiOwned.push({ file, domains: owners });
  }
  return { unowned, multiOwned, checked: tracked.length };
}

export function coverageMessage(coverage) {
  const parts = [];
  if (coverage.unowned.length > 0) {
    parts.push(`${coverage.unowned.length} tracked file(s) belong to no domain: ${coverage.unowned.slice(0, 8).join(', ')}${coverage.unowned.length > 8 ? ', …' : ''}`);
  }
  if (coverage.multiOwned.length > 0) {
    parts.push(`${coverage.multiOwned.length} tracked file(s) belong to two domains: ${coverage.multiOwned.slice(0, 8).map((m) => `${m.file} (${m.domains.join(', ')})`).join(', ')}`);
  }
  return `The domain map does not cover the tracked files exactly once — ${parts.join('; ')}. ` +
    'A file that is new since the committed map needs a part: add it to atlas/boundaries.yaml, run `atlas map`, and commit atlas/.';
}
