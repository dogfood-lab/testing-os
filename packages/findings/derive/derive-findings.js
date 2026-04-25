/**
 * Main derivation engine.
 * Takes verified dogfood records and deterministically emits candidate findings.
 *
 * Usage:
 *   deriveFromRecord(record, { rejected }) → CandidateFinding[]
 *   deriveFromRecords(records) → { candidates, stats }
 */

import { RULES } from './rules.js';
import { generateFindingId } from './ids.js';
import { dedupeWithinBatch } from './dedupe.js';

/**
 * Derive candidate findings from a single verified record.
 *
 * @param {object} record - Full persisted dogfood record.
 * @param {{ rejected?: boolean }} opts
 * @returns {Array} - Zero or more schema-valid candidate finding objects.
 */
export function deriveFromRecord(record, opts = {}) {
  const rejected = opts.rejected ?? false;
  const repo = record.repo || '';
  const repoSlug = repo.split('/').pop() || 'unknown';
  const now = new Date().toISOString();

  const ctx = { record, rejected, repoSlug };
  const raw = [];

  for (const rule of RULES) {
    try {
      if (rule.applies(ctx)) {
        const emitted = rule.derive(ctx);
        for (const e of emitted) {
          raw.push(assembleFinding(e, record, rule, repoSlug, now));
        }
      }
    } catch (err) {
      // Rule failure should not crash the engine — skip silently
      // In a real system this would be logged
    }
  }

  // Dedupe within this record's batch
  const { unique } = dedupeWithinBatch(raw);
  return unique;
}

/**
 * Derive candidate findings from multiple records.
 *
 * @param {Array<{ record: object, rejected: boolean }>} entries
 * @returns {{ candidates: Array, stats: { recordsProcessed: number, rulesEvaluated: number, candidatesEmitted: number, deduped: number } }}
 */
export function deriveFromRecords(entries) {
  const allCandidates = [];
  let rulesEvaluated = 0;

  for (const entry of entries) {
    rulesEvaluated += RULES.length;
    const candidates = deriveFromRecord(entry.record, { rejected: entry.rejected });
    allCandidates.push(...candidates);
  }

  const { unique, skipped } = dedupeWithinBatch(allCandidates);

  return {
    candidates: unique,
    stats: {
      recordsProcessed: entries.length,
      rulesEvaluated,
      candidatesEmitted: unique.length,
      deduped: skipped
    }
  };
}

/**
 * Assemble a full schema-valid finding object from rule output.
 */
function assembleFinding(raw, record, rule, repoSlug, now) {
  const findingId = generateFindingId(repoSlug, raw.slug);

  return {
    schema_version: '1.0.0',
    finding_id: findingId,
    title: raw.title,
    status: 'candidate',
    repo: record.repo,
    product_surface: raw.product_surface,
    execution_mode: record.scenario_results?.[0]?.execution_mode,
    journey_stage: raw.journey_stage,
    issue_kind: raw.issue_kind,
    root_cause_kind: raw.root_cause_kind,
    remediation_kind: raw.remediation_kind,
    transfer_scope: raw.transfer_scope,
    summary: raw.summary,
    source_record_ids: [record.run_id],
    scenario_ids: record.scenario_results
      ?.map(s => s.scenario_id)
      .filter(Boolean) || [],
    evidence: raw.evidence,
    derived: {
      method: 'deterministic_rule',
      rule_id: rule.ruleId,
      derived_at: now,
      rationale: raw.rationale
    },
    created_at: now,
    updated_at: now
  };
}

/**
 * Get the rule inventory (for explain/list).
 */
export function getRuleInventory() {
  return RULES.map(r => ({
    ruleId: r.ruleId,
    description: r.description
  }));
}

export { RULES };
