/**
 * Advice bundle synthesis.
 *
 * Produces structured guidance bundles for future projects
 * based on surface, execution mode, and archetype.
 */

import {
  queryFindings,
  queryPatterns,
  queryRecommendations,
  queryDoctrine,
  queryFailureClasses
} from './query.js';

/**
 * Generate an advice bundle for a given scope.
 *
 * @param {string} rootDir - dogfood-labs repo root
 * @param {object} scope
 * @param {string} [scope.surface] - product surface
 * @param {string} [scope.executionMode] - bot/human/mixed
 * @param {string} [scope.repo] - specific repo
 * @param {string} [scope.journeyStage] - journey stage filter
 * @param {string} [scope.issueKind] - issue kind filter
 * @returns {object} Structured advice bundle
 */
export function generateAdviceBundle(rootDir, scope = {}) {
  const recommendations = queryRecommendations(rootDir, scope);
  const doctrine = queryDoctrine(rootDir, scope);
  const patterns = queryPatterns(rootDir, scope);
  const failureClasses = queryFailureClasses(rootDir, scope);
  const findings = queryFindings(rootDir, { ...scope, limit: 8 });

  // Categorize recommendations by kind
  const starterChecks = recommendations.filter(r =>
    r.recommendation_kind === 'starter_check' || r.recommendation_kind === 'starter_scenario'
  );
  const evidenceExpectations = recommendations.filter(r =>
    r.recommendation_kind === 'evidence_expectation' || r.recommendation_kind === 'policy_seed'
  );
  const verificationRules = recommendations.filter(r =>
    r.recommendation_kind === 'verification_rule' || r.recommendation_kind === 'review_prompt'
  );

  return {
    query: {
      product_surface: scope.surface || null,
      execution_mode: scope.executionMode || null,
      repo: scope.repo || null
    },
    advice: {
      starter_checks: starterChecks.map(r => ({
        id: r.recommendation_id,
        title: r.title,
        action: r.action,
        confidence: r.confidence
      })),
      evidence_expectations: evidenceExpectations.map(r => ({
        id: r.recommendation_id,
        title: r.title,
        action: r.action,
        confidence: r.confidence
      })),
      verification_rules: verificationRules.map(r => ({
        id: r.recommendation_id,
        title: r.title,
        action: r.action,
        confidence: r.confidence
      })),
      likely_failure_classes: failureClasses,
      relevant_doctrine: doctrine.map(d => ({
        id: d.doctrine_id,
        statement: d.statement,
        strength: d.strength,
        kind: d.doctrine_kind
      }))
    },
    support: {
      pattern_ids: patterns.map(p => p.pattern_id),
      finding_ids: findings.map(f => f.finding_id),
      pattern_count: patterns.length,
      finding_count: findings.length,
      recommendation_count: recommendations.length,
      doctrine_count: doctrine.length
    }
  };
}

/**
 * Generate a sync-friendly export of all accepted artifacts.
 * For repo-knowledge consumption.
 *
 * @param {string} rootDir
 * @returns {object} Export bundle with all accepted artifacts and lineage
 */
export function generateSyncExport(rootDir) {
  const findings = queryFindings(rootDir, { limit: 500 });
  const patterns = queryPatterns(rootDir, { limit: 100 });
  const recommendations = queryRecommendations(rootDir, { limit: 100 });
  const doctrine = queryDoctrine(rootDir, { limit: 100 });

  return {
    exported_at: new Date().toISOString(),
    source: 'dogfood-labs',
    counts: {
      findings: findings.length,
      patterns: patterns.length,
      recommendations: recommendations.length,
      doctrine: doctrine.length
    },
    findings: findings.map(f => ({
      finding_id: f.finding_id,
      title: f.title,
      repo: f.repo,
      product_surface: f.product_surface,
      issue_kind: f.issue_kind,
      root_cause_kind: f.root_cause_kind,
      remediation_kind: f.remediation_kind,
      transfer_scope: f.transfer_scope,
      summary: f.summary,
      doctrine_statement: f.doctrine_statement
    })),
    patterns: patterns.map(p => ({
      pattern_id: p.pattern_id,
      title: p.title,
      pattern_kind: p.pattern_kind,
      pattern_strength: p.pattern_strength,
      transfer_scope: p.transfer_scope,
      summary: p.summary,
      source_finding_ids: p.source_finding_ids,
      dimensions: p.dimensions,
      support: p.support
    })),
    recommendations: recommendations.map(r => ({
      recommendation_id: r.recommendation_id,
      title: r.title,
      recommendation_kind: r.recommendation_kind,
      confidence: r.confidence,
      applies_to: r.applies_to,
      action: r.action,
      based_on_pattern_ids: r.based_on_pattern_ids
    })),
    doctrine: doctrine.map(d => ({
      doctrine_id: d.doctrine_id,
      title: d.title,
      doctrine_kind: d.doctrine_kind,
      strength: d.strength,
      statement: d.statement,
      rationale: d.rationale,
      transfer_scope: d.transfer_scope,
      based_on_pattern_ids: d.based_on_pattern_ids
    }))
  };
}
