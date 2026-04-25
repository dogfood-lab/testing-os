/**
 * Recommendation derivation from accepted patterns.
 *
 * Generates actionable guidance using constrained templates based on
 * pattern kind, dimensions, and transfer scope.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import yaml from 'js-yaml';

/**
 * Derive recommendations from accepted patterns.
 *
 * @param {string} rootDir - dogfood-labs repo root
 * @returns {{ recommendations: Array, stats: { patternsConsidered: number, recommendationsEmitted: number } }}
 */
export function deriveRecommendations(rootDir) {
  const patterns = loadAcceptedPatterns(rootDir);
  const recommendations = [];

  for (const pat of patterns) {
    const rec = deriveFromPattern(pat);
    if (rec) recommendations.push(rec);
  }

  return {
    recommendations,
    stats: {
      patternsConsidered: patterns.length,
      recommendationsEmitted: recommendations.length
    }
  };
}

/**
 * Derive a recommendation from a single accepted pattern.
 */
function deriveFromPattern(pattern) {
  const now = new Date().toISOString();
  const template = selectTemplate(pattern);
  if (!template) return null;

  const surfaces = pattern.dimensions?.product_surfaces || [];
  const slug = `${surfaces[0] || 'general'}-${template.kind}`.replace(/_/g, '-');

  return {
    schema_version: '1.0.0',
    recommendation_id: `drec-${slug}-${pattern.pattern_id.replace('dpat-', '')}`,
    title: template.titleFn(pattern),
    status: 'candidate',
    recommendation_kind: template.kind,
    summary: template.summaryFn(pattern),
    applies_to: {
      product_surfaces: surfaces,
      ...(pattern.support?.execution_modes?.length ? { execution_modes: pattern.support.execution_modes } : {}),
      transfer_scope: pattern.transfer_scope
    },
    based_on_pattern_ids: [pattern.pattern_id],
    action: {
      type: template.actionType,
      target: template.target,
      details: template.detailsFn(pattern)
    },
    confidence: pattern.pattern_strength === 'strong' || pattern.pattern_strength === 'portfolio_stable' ? 'strong' : 'emerging',
    created_at: now,
    updated_at: now
  };
}

/**
 * Select the right recommendation template for a pattern.
 */
function selectTemplate(pattern) {
  const kind = pattern.pattern_kind;
  const issueKinds = pattern.dimensions?.issue_kinds || [];

  if (issueKinds.some(k => /interface|surface|entrypoint|build/.test(k))) {
    return {
      kind: 'starter_check',
      actionType: 'add_check',
      target: 'rollout',
      titleFn: (p) => `Add ${issueKinds[0].replace(/_/g, ' ')} verification to starter rollout for ${fmtSurfaces(p)}`,
      summaryFn: (p) => `New ${fmtSurfaces(p)} repos should verify ${issueKinds[0].replace(/_/g, ' ')} before rollout assumptions are encoded into scenarios or docs. This recurs across ${p.support.repo_count} repo(s).`,
      detailsFn: (p) => `Verify ${issueKinds[0].replace(/_/g, ' ')} contract and invocation shape before scenario authoring for ${fmtSurfaces(p)} repos.`
    };
  }

  if (kind === 'evidence_calibration') {
    return {
      kind: 'evidence_expectation',
      actionType: 'set_evidence',
      target: 'policy',
      titleFn: (p) => `Calibrate evidence requirements for ${fmtSurfaces(p)} based on recurring miscalibration`,
      summaryFn: (p) => `Evidence requirements for ${fmtSurfaces(p)} have been repeatedly miscalibrated. Default to natural output types rather than forced artifact shapes.`,
      detailsFn: (p) => `Review and adjust evidence_requirements in surface policy to match natural outputs for ${fmtSurfaces(p)} repos.`
    };
  }

  if (kind === 'verification_seam') {
    return {
      kind: 'verification_rule',
      actionType: 'set_verification',
      target: 'verification',
      titleFn: (p) => `Add verification guard for ${issueKinds[0]?.replace(/_/g, ' ') || 'seam'} on ${fmtSurfaces(p)}`,
      summaryFn: (p) => `A verification seam recurs on ${fmtSurfaces(p)}. Add a guard to prevent this class of verification failure.`,
      detailsFn: (p) => `Add verification step to detect ${issueKinds[0]?.replace(/_/g, ' ') || 'verification gap'} before acceptance.`
    };
  }

  if (kind === 'calibration_signal') {
    return {
      kind: 'policy_seed',
      actionType: 'set_policy',
      target: 'policy',
      titleFn: (p) => `Seed ${fmtSurfaces(p)} policy with calibrated defaults from recurring pattern`,
      summaryFn: (p) => `Policy miscalibration recurs on ${fmtSurfaces(p)}. Seed new repo policies with proven defaults.`,
      detailsFn: (p) => `Apply calibrated policy defaults for ${fmtSurfaces(p)} repos based on ${p.support.finding_count} proven findings.`
    };
  }

  // Default: starter_check
  return {
    kind: 'starter_check',
    actionType: 'add_check',
    target: 'rollout',
    titleFn: (p) => `Add check for ${issueKinds[0]?.replace(/_/g, ' ') || 'recurring issue'} on ${fmtSurfaces(p)}`,
    summaryFn: (p) => `A recurring issue pattern was detected on ${fmtSurfaces(p)}. Add a rollout check to prevent future occurrences.`,
    detailsFn: (p) => `Add a rollout verification step for ${issueKinds[0]?.replace(/_/g, ' ') || 'this issue class'} on ${fmtSurfaces(p)} repos.`
  };
}

function fmtSurfaces(pattern) {
  const s = pattern.dimensions?.product_surfaces || [];
  return s.length ? s.join(', ') : 'general';
}

/**
 * Load accepted patterns from disk.
 */
function loadAcceptedPatterns(rootDir) {
  const dir = resolve(rootDir, 'patterns');
  if (!existsSync(dir)) return [];

  const patterns = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.yaml')) continue;
    try {
      const data = yaml.load(readFileSync(join(dir, file), 'utf-8'));
      if (data?.status === 'accepted') patterns.push(data);
    } catch { /* skip */ }
  }
  return patterns;
}

export { loadAcceptedPatterns };
