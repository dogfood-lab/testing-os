/**
 * Deduplication logic for derived candidate findings.
 *
 * Dedupe law:
 *  - Same record re-derived → same ID → skip if identical candidate exists
 *  - Same ID with non-candidate status → collision, not overwrite
 *  - Multiple evidence points in one record that map to one lesson → one finding
 */

import { computeDedupeKey } from './ids.js';

/**
 * Deduplicate a list of raw derived candidates.
 * Returns unique candidates with collision info.
 *
 * @param {Array} candidates - Raw derived candidates from rules.
 * @returns {{ unique: Array, skipped: number }}
 */
export function dedupeWithinBatch(candidates) {
  const seen = new Map();
  const unique = [];
  let skipped = 0;

  for (const c of candidates) {
    const key = computeDedupeKey({
      repo: c.repo,
      issue_kind: c.issue_kind,
      root_cause_kind: c.root_cause_kind,
      journey_stage: c.journey_stage,
      slug: c.finding_id
    });

    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.set(key, true);
    unique.push(c);
  }

  return { unique, skipped };
}

/**
 * Check existing findings on disk for collisions.
 *
 * @param {Array} candidates - Candidate findings to check.
 * @param {Array<{ data: object }>} existingFindings - Already-loaded findings from disk.
 * @returns {{ toWrite: Array, skippedUnchanged: number, collisions: Array<{ findingId: string, existingStatus: string }> }}
 */
export function dedupeAgainstExisting(candidates, existingFindings) {
  const existingById = new Map();
  for (const f of existingFindings) {
    if (f.data?.finding_id) {
      existingById.set(f.data.finding_id, f.data);
    }
  }

  const toWrite = [];
  let skippedUnchanged = 0;
  const collisions = [];

  for (const c of candidates) {
    const existing = existingById.get(c.finding_id);

    if (!existing) {
      toWrite.push(c);
      continue;
    }

    // Same ID exists — check status
    if (existing.status !== 'candidate') {
      // Non-candidate status: collision, don't overwrite
      collisions.push({
        findingId: c.finding_id,
        existingStatus: existing.status
      });
      continue;
    }

    // Same ID, still candidate — skip if unchanged
    if (isSameCandidate(c, existing)) {
      skippedUnchanged++;
      continue;
    }

    // Same ID, still candidate, but content changed — refresh
    toWrite.push(c);
  }

  return { toWrite, skippedUnchanged, collisions };
}

/**
 * Check if two findings are substantively identical.
 * Ignores timestamps and derivation metadata.
 */
function isSameCandidate(a, b) {
  return (
    a.issue_kind === b.issue_kind &&
    a.root_cause_kind === b.root_cause_kind &&
    a.remediation_kind === b.remediation_kind &&
    a.transfer_scope === b.transfer_scope &&
    a.summary === b.summary &&
    a.title === b.title
  );
}
