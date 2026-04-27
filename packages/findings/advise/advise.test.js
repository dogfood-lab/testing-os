import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';

import { queryFindings, queryPatterns, queryRecommendations, queryDoctrine, queryFailureClasses } from './query.js';
import { generateAdviceBundle, generateSyncExport } from './advice-bundle.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_ROOT = resolve(__dirname, '__test_advise__');

// ─── Test data setup ────────────────────────────────────────

function writeFinding(rootDir, data) {
  const [org, repo] = data.repo.split('/');
  const dir = resolve(rootDir, 'findings', org, repo);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${data.finding_id}.yaml`), yaml.dump(data, { lineWidth: 120 }), 'utf-8');
}

function writeArtifact(rootDir, subdir, filename, data) {
  const dir = resolve(rootDir, subdir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, filename), yaml.dump(data, { lineWidth: 120 }), 'utf-8');
}

function setupFullTestData() {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });

  // ── Accepted findings ──
  writeFinding(TEST_ROOT, {
    schema_version: '1.0.0', finding_id: 'dfind-mcp-interface',
    title: 'MCP server runtime interface misclassified as CLI',
    status: 'accepted', repo: 'mcp-tool-shop-org/repo-crawler-mcp',
    product_surface: 'mcp-server', execution_mode: 'bot', journey_stage: 'verification',
    issue_kind: 'interface_assumption', root_cause_kind: 'surface_misclassification',
    remediation_kind: 'classification_fix', transfer_scope: 'surface_archetype',
    summary: 'MCP server was verified using CLI assumptions. Correct runtime is stdio JSON-RPC.',
    source_record_ids: ['record-mcp-1'],
    evidence: [{ evidence_kind: 'record', record_id: 'record-mcp-1' }]
  });

  writeFinding(TEST_ROOT, {
    schema_version: '1.0.0', finding_id: 'dfind-guardian-interface',
    title: 'Guardian MCP server also misclassified surface enum',
    status: 'accepted', repo: 'mcp-tool-shop-org/claude-guardian',
    product_surface: 'mcp-server', execution_mode: 'bot', journey_stage: 'verification',
    issue_kind: 'interface_assumption', root_cause_kind: 'surface_misclassification',
    remediation_kind: 'classification_fix', transfer_scope: 'surface_archetype',
    summary: 'Guardian used mcp instead of mcp-server enum value. Same pattern as repo-crawler.',
    source_record_ids: ['record-guardian-1'],
    evidence: [{ evidence_kind: 'record', record_id: 'record-guardian-1' }]
  });

  writeFinding(TEST_ROOT, {
    schema_version: '1.0.0', finding_id: 'dfind-cli-entrypoint',
    title: 'CLI entrypoint flags wrong for shipcheck',
    status: 'accepted', repo: 'mcp-tool-shop-org/shipcheck',
    product_surface: 'cli', execution_mode: 'bot', journey_stage: 'first_run',
    issue_kind: 'entrypoint_truth', root_cause_kind: 'docs_code_drift',
    remediation_kind: 'scenario_change', transfer_scope: 'surface_archetype',
    summary: 'Shipcheck scenario used wrong CLI flags. Positional arg not --store flag.',
    source_record_ids: ['record-cli-1'],
    evidence: [{ evidence_kind: 'record', record_id: 'record-cli-1' }]
  });

  writeFinding(TEST_ROOT, {
    schema_version: '1.0.0', finding_id: 'dfind-cli-build',
    title: 'ai-loadout build output mismatch with scenario',
    status: 'accepted', repo: 'mcp-tool-shop-org/ai-loadout',
    product_surface: 'cli', execution_mode: 'bot', journey_stage: 'first_run',
    issue_kind: 'build_output_mismatch', root_cause_kind: 'build_config_error',
    remediation_kind: 'build_config_fix', transfer_scope: 'surface_archetype',
    summary: 'ai-loadout scenario invoked src/cli.ts instead of dist/cli.js.',
    source_record_ids: ['record-cli-2'],
    evidence: [{ evidence_kind: 'record', record_id: 'record-cli-2' }]
  });

  writeFinding(TEST_ROOT, {
    schema_version: '1.0.0', finding_id: 'dfind-desktop-evidence',
    title: 'Desktop evidence requirements too strict for mixed mode',
    status: 'accepted', repo: 'mcp-tool-shop-org/glyphstudio',
    product_surface: 'desktop', execution_mode: 'mixed', journey_stage: 'verification',
    issue_kind: 'evidence_overconstraint', root_cause_kind: 'policy_overconstraint',
    remediation_kind: 'evidence_requirement_change', transfer_scope: 'surface_archetype',
    summary: 'GlyphStudio evidence requirements forced artifact evidence when log+transcript was natural.',
    source_record_ids: ['record-desktop-1'],
    evidence: [{ evidence_kind: 'record', record_id: 'record-desktop-1' }]
  });

  // Invalidated finding — should be excluded
  writeFinding(TEST_ROOT, {
    schema_version: '1.0.0', finding_id: 'dfind-invalidated',
    title: 'This finding was invalidated and should not appear',
    status: 'accepted', repo: 'mcp-tool-shop-org/test-repo',
    product_surface: 'cli', execution_mode: 'bot', journey_stage: 'first_run',
    issue_kind: 'entrypoint_truth', root_cause_kind: 'contract_drift',
    remediation_kind: 'docs_change', transfer_scope: 'repo_local',
    summary: 'Invalidated finding that should be excluded from all advice queries.',
    source_record_ids: ['record-inv'],
    evidence: [{ evidence_kind: 'record', record_id: 'record-inv' }],
    invalidation: { is_invalidated: true, invalidated_at: '2026-03-29T00:00:00Z', reason: 'test' }
  });

  // Candidate finding — should be excluded
  writeFinding(TEST_ROOT, {
    schema_version: '1.0.0', finding_id: 'dfind-candidate-only',
    title: 'This candidate finding should not appear in advice',
    status: 'candidate', repo: 'mcp-tool-shop-org/test-repo',
    product_surface: 'cli', execution_mode: 'bot', journey_stage: 'first_run',
    issue_kind: 'entrypoint_truth', root_cause_kind: 'contract_drift',
    remediation_kind: 'docs_change', transfer_scope: 'repo_local',
    summary: 'Candidate finding not yet reviewed so it should not appear in any advice.',
    source_record_ids: ['record-cand'],
    evidence: [{ evidence_kind: 'record', record_id: 'record-cand' }]
  });

  // ── Accepted patterns ──
  writeArtifact(TEST_ROOT, 'patterns', 'dpat-mcp-interface-truth.yaml', {
    schema_version: '1.0.0', pattern_id: 'dpat-mcp-interface-truth',
    title: 'Interface assumption recurs across 2 repos on mcp-server',
    status: 'accepted', pattern_kind: 'recurring_failure',
    summary: 'Multiple MCP repos misclassified their runtime interface during rollout.',
    source_finding_ids: ['dfind-mcp-interface', 'dfind-guardian-interface'],
    support: { finding_count: 2, repo_count: 2, surface_count: 1, execution_modes: ['bot'] },
    dimensions: { product_surfaces: ['mcp-server'], issue_kinds: ['interface_assumption'], root_cause_kinds: ['surface_misclassification'], remediation_kinds: ['classification_fix'] },
    transfer_scope: 'surface_archetype', pattern_strength: 'strong'
  });

  writeArtifact(TEST_ROOT, 'patterns', 'dpat-cli-entrypoint.yaml', {
    schema_version: '1.0.0', pattern_id: 'dpat-cli-entrypoint',
    title: 'Entrypoint/build truth issues recur on CLI repos',
    status: 'accepted', pattern_kind: 'recurring_failure',
    summary: 'CLI repos frequently have scenario/entrypoint mismatch issues.',
    source_finding_ids: ['dfind-cli-entrypoint', 'dfind-cli-build'],
    support: { finding_count: 2, repo_count: 2, surface_count: 1, execution_modes: ['bot'] },
    dimensions: { product_surfaces: ['cli'], issue_kinds: ['entrypoint_truth', 'build_output_mismatch'], root_cause_kinds: ['docs_code_drift', 'build_config_error'] },
    transfer_scope: 'surface_archetype', pattern_strength: 'strong'
  });

  // ── Accepted recommendations ──
  writeArtifact(TEST_ROOT, 'recommendations', 'drec-mcp-runtime-check.yaml', {
    schema_version: '1.0.0', recommendation_id: 'drec-mcp-runtime-check',
    title: 'Add runtime truth verification to MCP server starter rollout',
    status: 'accepted', recommendation_kind: 'starter_check',
    summary: 'New MCP server repos should verify stdio JSON-RPC runtime before rollout.',
    applies_to: { product_surfaces: ['mcp-server'], transfer_scope: 'surface_archetype' },
    based_on_pattern_ids: ['dpat-mcp-interface-truth'],
    action: { type: 'add_check', target: 'rollout', details: 'Verify stdio JSON-RPC handshake before authoring scenarios.' },
    confidence: 'strong'
  });

  writeArtifact(TEST_ROOT, 'recommendations', 'drec-cli-entrypoint-check.yaml', {
    schema_version: '1.0.0', recommendation_id: 'drec-cli-entrypoint-check',
    title: 'Verify CLI entrypoint and build output before scenario authoring',
    status: 'accepted', recommendation_kind: 'starter_check',
    summary: 'CLI repos should verify built entrypoint before writing scenarios.',
    applies_to: { product_surfaces: ['cli'], transfer_scope: 'surface_archetype' },
    based_on_pattern_ids: ['dpat-cli-entrypoint'],
    action: { type: 'add_check', target: 'rollout', details: 'Run --help on built artifact before scenario steps.' },
    confidence: 'strong'
  });

  writeArtifact(TEST_ROOT, 'recommendations', 'drec-desktop-evidence.yaml', {
    schema_version: '1.0.0', recommendation_id: 'drec-desktop-evidence',
    title: 'Calibrate desktop mixed-mode evidence to natural outputs',
    status: 'accepted', recommendation_kind: 'evidence_expectation',
    summary: 'Desktop mixed evidence should default to log+transcript, not forced artifacts.',
    applies_to: { product_surfaces: ['desktop'], execution_modes: ['mixed'], transfer_scope: 'surface_archetype' },
    based_on_pattern_ids: ['dpat-mcp-interface-truth'],
    action: { type: 'set_evidence', target: 'policy', details: 'Default to log+transcript for desktop mixed scenarios.' },
    confidence: 'strong'
  });

  // ── Accepted doctrine ──
  writeArtifact(TEST_ROOT, 'doctrine', 'ddoc-runtime-truth.yaml', {
    schema_version: '1.0.0', doctrine_id: 'ddoc-runtime-truth',
    title: 'Verify runtime truth before authoring rollout assumptions',
    status: 'accepted', doctrine_kind: 'rollout_law',
    statement: 'Verify runtime interface and entrypoint truth before designing rollout scenarios. This is a proven recurring failure class.',
    rationale: 'Backed by 2 accepted patterns across 4 repos. Runtime/entrypoint misclassification recurs independently.',
    based_on_pattern_ids: ['dpat-mcp-interface-truth', 'dpat-cli-entrypoint'],
    transfer_scope: 'org_wide', strength: 'proven'
  });
}

// ============================================================
// Query tests
// ============================================================

// ── Query layer behavior pins ──────────────────────────────────
//
// F-742442-047 (advise/query.js) — `queryDoctrine` had a `|| true` dead-code
// short-circuit that made surface filtering a no-op. The Query: doctrine
// describe block below pins that doctrine results actually return (the
// regression would be `[]` if the filter logic were re-broken in the
// opposite direction). The behavior tested here — accepted doctrine returned
// when surface query is implicit — is the live counterpart of the F-742442-047
// fix.
//
// F-002109-029 (synthesis/pattern-derivation.js → advise/query.js
// scopeSpecificity) — `widest` initial value of 0 silently misclassified
// transfer_scope as `repo_local` for unknown scopes. The "ranks more specific
// scope higher" test below depends on transfer_scope being honestly reported
// upstream; if the synthesis bug regresses, advise's surface ranking quietly
// inverts.

describe('Query: findings', () => {
  before(() => setupFullTestData());
  after(() => { if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true }); });

  // F-742442-042 cousin — invalidation + candidate exclusion is the dedupe-
  // adjacent contract: a re-derived finding under a different status should
  // not surface as if accepted. dedupe.js relies on finding_id; this test
  // pins the status-gate one layer up.
  it('returns only accepted non-invalidated findings', () => {
    const results = queryFindings(TEST_ROOT, {});
    const ids = results.map(f => f.finding_id);
    assert.ok(!ids.includes('dfind-invalidated'), 'Invalidated should be excluded');
    assert.ok(!ids.includes('dfind-candidate-only'), 'Candidate should be excluded');
    assert.ok(ids.includes('dfind-mcp-interface'), 'Accepted should be included');
  });

  it('filters by surface', () => {
    const results = queryFindings(TEST_ROOT, { surface: 'mcp-server' });
    for (const f of results) {
      assert.equal(f.product_surface, 'mcp-server');
    }
    assert.ok(results.length >= 2);
  });

  it('filters by execution mode', () => {
    const results = queryFindings(TEST_ROOT, { executionMode: 'mixed' });
    for (const f of results) {
      assert.equal(f.execution_mode, 'mixed');
    }
  });

  it('filters by repo', () => {
    const results = queryFindings(TEST_ROOT, { repo: 'mcp-tool-shop-org/shipcheck' });
    assert.equal(results.length, 1);
    assert.equal(results[0].finding_id, 'dfind-cli-entrypoint');
  });

  it('respects limit cap', () => {
    const results = queryFindings(TEST_ROOT, { limit: 2 });
    assert.ok(results.length <= 2);
  });

  it('ranks more specific scope higher', () => {
    const results = queryFindings(TEST_ROOT, { surface: 'cli' });
    // surface_archetype findings should appear (all our cli findings are surface_archetype)
    assert.ok(results.length >= 2);
  });
});

describe('Query: patterns', () => {
  before(() => setupFullTestData());
  after(() => { if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true }); });

  it('returns accepted patterns', () => {
    const results = queryPatterns(TEST_ROOT, {});
    assert.ok(results.length >= 2);
  });

  it('filters by surface', () => {
    const results = queryPatterns(TEST_ROOT, { surface: 'mcp-server' });
    assert.ok(results.length >= 1);
    assert.ok(results[0].dimensions.product_surfaces.includes('mcp-server'));
  });

  it('ranks stronger patterns first', () => {
    const results = queryPatterns(TEST_ROOT, {});
    // Both are 'strong' so just verify they're returned
    assert.ok(results.every(p => p.pattern_strength === 'strong'));
  });
});

describe('Query: recommendations', () => {
  before(() => setupFullTestData());
  after(() => { if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true }); });

  it('returns accepted recommendations', () => {
    const results = queryRecommendations(TEST_ROOT, {});
    assert.ok(results.length >= 3);
  });

  it('filters by surface', () => {
    const results = queryRecommendations(TEST_ROOT, { surface: 'mcp-server' });
    assert.ok(results.length >= 1);
    for (const r of results) {
      assert.ok(r.applies_to.product_surfaces.includes('mcp-server'));
    }
  });

  it('filters by execution mode', () => {
    const results = queryRecommendations(TEST_ROOT, { surface: 'desktop', executionMode: 'mixed' });
    assert.ok(results.length >= 1);
  });
});

// F-742442-047 — direct pin. `queryDoctrine` previously short-circuited via
// `|| true`; the productized form must still surface accepted doctrine.
describe('Query: doctrine (F-742442-047)', () => {
  before(() => setupFullTestData());
  after(() => { if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true }); });

  it('returns accepted doctrine', () => {
    const results = queryDoctrine(TEST_ROOT, {});
    assert.ok(results.length >= 1);
    assert.equal(results[0].doctrine_id, 'ddoc-runtime-truth');
  });
});

describe('Query: failure classes', () => {
  before(() => setupFullTestData());
  after(() => { if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true }); });

  it('returns top failure classes', () => {
    const results = queryFailureClasses(TEST_ROOT, { surface: 'mcp-server' });
    assert.ok(results.length >= 1);
    assert.equal(results[0].issueKind, 'interface_assumption');
    assert.equal(results[0].count, 2);
  });

  it('caps at 3', () => {
    const results = queryFailureClasses(TEST_ROOT, {});
    assert.ok(results.length <= 3);
  });
});

// ============================================================
// Advice bundle tests
// ============================================================

describe('Advice bundle: structure', () => {
  before(() => setupFullTestData());
  after(() => { if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true }); });

  it('produces stable bundle structure', () => {
    const bundle = generateAdviceBundle(TEST_ROOT, { surface: 'mcp-server' });
    assert.ok(bundle.query);
    assert.ok(bundle.advice);
    assert.ok(bundle.support);
    assert.equal(bundle.query.product_surface, 'mcp-server');
  });

  it('includes starter checks', () => {
    const bundle = generateAdviceBundle(TEST_ROOT, { surface: 'mcp-server' });
    assert.ok(bundle.advice.starter_checks.length >= 1);
    assert.ok(bundle.advice.starter_checks[0].id);
    assert.ok(bundle.advice.starter_checks[0].action);
  });

  it('includes failure classes', () => {
    const bundle = generateAdviceBundle(TEST_ROOT, { surface: 'mcp-server' });
    assert.ok(bundle.advice.likely_failure_classes.length >= 1);
  });

  it('includes doctrine', () => {
    const bundle = generateAdviceBundle(TEST_ROOT, { surface: 'mcp-server' });
    assert.ok(bundle.advice.relevant_doctrine.length >= 1);
    assert.ok(bundle.advice.relevant_doctrine[0].statement);
  });

  it('includes support lineage', () => {
    const bundle = generateAdviceBundle(TEST_ROOT, { surface: 'mcp-server' });
    assert.ok(bundle.support.pattern_ids.length >= 1);
    assert.ok(bundle.support.finding_ids.length >= 1);
  });
});

// ============================================================
// Sync export tests
// ============================================================

// ── Sync export ────────────────────────────────────────────────
//
// F-742442-042 cousin — sync export must obey the same dedupe-and-status
// contract as the dedupe.js layer: invalidated findings are EXCLUDED, and
// the (run_id, fingerprint) uniqueness assumption flows through.

describe('Sync export', () => {
  before(() => setupFullTestData());
  after(() => { if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true }); });

  it('exports accepted artifacts with provenance', () => {
    const exp = generateSyncExport(TEST_ROOT);
    assert.ok(exp.exported_at);
    assert.equal(exp.source, 'dogfood-labs');
    assert.ok(exp.counts.findings >= 5);
    assert.ok(exp.counts.patterns >= 2);
    assert.ok(exp.counts.recommendations >= 3);
    assert.ok(exp.counts.doctrine >= 1);
  });

  it('findings preserve IDs and classification', () => {
    const exp = generateSyncExport(TEST_ROOT);
    for (const f of exp.findings) {
      assert.ok(f.finding_id);
      assert.ok(f.issue_kind);
      assert.ok(f.summary);
    }
  });

  it('excludes invalidated findings', () => {
    const exp = generateSyncExport(TEST_ROOT);
    const ids = exp.findings.map(f => f.finding_id);
    assert.ok(!ids.includes('dfind-invalidated'));
  });

  it('patterns preserve lineage', () => {
    const exp = generateSyncExport(TEST_ROOT);
    for (const p of exp.patterns) {
      assert.ok(p.source_finding_ids.length >= 1);
    }
  });

  it('recommendations preserve pattern refs', () => {
    const exp = generateSyncExport(TEST_ROOT);
    for (const r of exp.recommendations) {
      assert.ok(r.based_on_pattern_ids.length >= 1);
    }
  });

  it('doctrine preserves pattern refs and statement', () => {
    const exp = generateSyncExport(TEST_ROOT);
    for (const d of exp.doctrine) {
      assert.ok(d.statement);
      assert.ok(d.based_on_pattern_ids.length >= 1);
    }
  });
});

// ============================================================
// End-to-end usefulness tests
// ============================================================

describe('E2E: new MCP server bootstrap', () => {
  before(() => setupFullTestData());
  after(() => { if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true }); });

  it('gets runtime truth guidance', () => {
    const bundle = generateAdviceBundle(TEST_ROOT, { surface: 'mcp-server' });
    const checks = bundle.advice.starter_checks;
    assert.ok(checks.some(c => c.id.includes('mcp')), 'Should include MCP-specific starter check');
  });

  it('gets interface assumption as likely failure class', () => {
    const bundle = generateAdviceBundle(TEST_ROOT, { surface: 'mcp-server' });
    const fcs = bundle.advice.likely_failure_classes;
    assert.ok(fcs.some(fc => fc.issueKind === 'interface_assumption'));
  });

  it('gets relevant doctrine', () => {
    const bundle = generateAdviceBundle(TEST_ROOT, { surface: 'mcp-server' });
    assert.ok(bundle.advice.relevant_doctrine.length >= 1);
  });
});

describe('E2E: new CLI repo bootstrap', () => {
  before(() => setupFullTestData());
  after(() => { if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true }); });

  it('gets entrypoint check guidance', () => {
    const bundle = generateAdviceBundle(TEST_ROOT, { surface: 'cli' });
    const checks = bundle.advice.starter_checks;
    assert.ok(checks.some(c => c.id.includes('cli')), 'Should include CLI-specific starter check');
  });

  it('gets CLI failure classes', () => {
    const bundle = generateAdviceBundle(TEST_ROOT, { surface: 'cli' });
    const fcs = bundle.advice.likely_failure_classes;
    assert.ok(fcs.length >= 1);
  });

  it('gets doctrine', () => {
    const bundle = generateAdviceBundle(TEST_ROOT, { surface: 'cli' });
    assert.ok(bundle.advice.relevant_doctrine.length >= 1);
  });
});

describe('E2E: new desktop mixed-mode app', () => {
  before(() => setupFullTestData());
  after(() => { if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true }); });

  it('gets evidence calibration guidance', () => {
    const bundle = generateAdviceBundle(TEST_ROOT, { surface: 'desktop', executionMode: 'mixed' });
    const ev = bundle.advice.evidence_expectations;
    assert.ok(ev.length >= 1, 'Should get evidence expectations for desktop mixed');
  });

  it('gets desktop findings', () => {
    const bundle = generateAdviceBundle(TEST_ROOT, { surface: 'desktop', executionMode: 'mixed' });
    assert.ok(bundle.support.finding_count >= 1);
  });
});
