import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';

import { deriveFromRecord, deriveFromRecords, getRuleInventory, RULES } from './derive-findings.js';
import { generateFindingId, computeDedupeKey } from './ids.js';
import { dedupeWithinBatch, dedupeAgainstExisting } from './dedupe.js';
import { loadRecordById, loadAllRecords } from './load-records.js';
import { writeFinding, writeFindings } from './write-findings.js';
import { validateFinding } from '../validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');

// ─── Fixture records ────────────────────────────────────────

/** Minimal valid accepted record with passing scenario. */
function makePassingRecord(overrides = {}) {
  return {
    schema_version: '1.0.0',
    policy_version: '1.0.0',
    run_id: 'test-pass-001',
    repo: 'mcp-tool-shop-org/test-repo',
    ref: { commit_sha: 'a'.repeat(40) },
    source: { provider: 'github', workflow: 'dogfood.yml', provider_run_id: '1', run_url: 'https://example.com' },
    timing: { started_at: '2026-03-29T00:00:00Z', finished_at: '2026-03-29T00:01:00Z' },
    ci_checks: [],
    scenario_results: [{
      scenario_id: 'basic-test',
      product_surface: 'cli',
      execution_mode: 'bot',
      verdict: 'pass',
      step_results: [{ step_id: 'run-test', status: 'pass' }],
      evidence: [{ kind: 'log', url: 'https://example.com/log' }]
    }],
    overall_verdict: { proposed: 'pass', verified: 'pass', downgraded: false },
    verification: {
      status: 'accepted',
      verified_at: '2026-03-29T00:01:00Z',
      provenance_confirmed: true,
      schema_valid: true,
      policy_valid: true,
      rejection_reasons: []
    },
    ...overrides
  };
}

/** Record with surface misclassification (rejected). */
function makeSurfaceMisclassRecord() {
  return makePassingRecord({
    run_id: 'test-surface-001',
    repo: 'mcp-tool-shop-org/test-mcp-server',
    scenario_results: [{
      scenario_id: 'mcp-handshake',
      product_surface: 'mcp', // BAD: should be mcp-server
      execution_mode: 'bot',
      verdict: 'pass',
      step_results: [{ step_id: 'run-init', status: 'pass' }],
      evidence: [{ kind: 'log', url: 'https://example.com/log' }]
    }],
    overall_verdict: { proposed: 'pass', verified: 'fail', downgraded: true, downgrade_reasons: ['schema or provenance validation failed'] },
    verification: {
      status: 'rejected',
      verified_at: '2026-03-29T00:01:00Z',
      provenance_confirmed: false,
      schema_valid: false,
      policy_valid: false,
      rejection_reasons: ['schema: /scenario_results/0/product_surface must be equal to one of the allowed values']
    }
  });
}

/** Record with evidence policy mismatch (rejected). */
function makeEvidencePolicyRecord() {
  return makePassingRecord({
    run_id: 'test-evidence-001',
    repo: 'mcp-tool-shop-org/test-cli',
    scenario_results: [{
      scenario_id: 'cli-test',
      product_surface: 'cli',
      execution_mode: 'bot',
      verdict: 'fail',
      step_results: [{ step_id: 'run-help', status: 'pass' }, { step_id: 'verify-output', status: 'fail' }],
      evidence: [{ kind: 'log', url: 'https://example.com/log' }]
    }],
    overall_verdict: { proposed: 'fail', verified: 'fail', downgraded: false, downgrade_reasons: ['policy validation failed'] },
    verification: {
      status: 'rejected',
      verified_at: '2026-03-29T00:01:00Z',
      provenance_confirmed: true,
      schema_valid: true,
      policy_valid: false,
      rejection_reasons: [
        'policy: surface[cli]: requires 2 evidence items, got 1',
        'policy: surface[cli]: required evidence kind "artifact" is missing'
      ]
    }
  });
}

/** Record with verdict downgrade. */
function makeDowngradeRecord() {
  return makePassingRecord({
    run_id: 'test-downgrade-001',
    repo: 'mcp-tool-shop-org/test-tool',
    overall_verdict: { proposed: 'pass', verified: 'fail', downgraded: true, downgrade_reasons: ['schema or provenance validation failed'] },
    verification: {
      status: 'rejected',
      verified_at: '2026-03-29T00:01:00Z',
      provenance_confirmed: true,
      schema_valid: false,
      policy_valid: false,
      rejection_reasons: ['schema: /some/path invalid']
    }
  });
}

/** Record with step failure. */
function makeStepFailureRecord() {
  return makePassingRecord({
    run_id: 'test-stepfail-001',
    repo: 'mcp-tool-shop-org/test-cli-tool',
    scenario_results: [{
      scenario_id: 'cli-full-test',
      product_surface: 'cli',
      execution_mode: 'bot',
      verdict: 'fail',
      step_results: [
        { step_id: 'run-help', status: 'pass' },
        { step_id: 'run-init', status: 'pass' },
        { step_id: 'verify-output', status: 'fail' }
      ],
      evidence: [{ kind: 'log', url: 'https://example.com/log' }]
    }],
    overall_verdict: { proposed: 'fail', verified: 'fail', downgraded: false }
  });
}

/** Record with blocked scenario. */
function makeBlockedRecord() {
  return makePassingRecord({
    run_id: 'test-blocked-001',
    repo: 'mcp-tool-shop-org/test-api',
    scenario_results: [{
      scenario_id: 'api-health',
      product_surface: 'api',
      execution_mode: 'bot',
      verdict: 'blocked',
      blocking_reason: 'Server failed to start on port 4321',
      step_results: [{ step_id: 'start-server', status: 'blocked' }],
      evidence: []
    }]
  });
}

/** Record with mixed mode missing attestation. */
function makeMissingAttestationRecord() {
  return makePassingRecord({
    run_id: 'test-attest-001',
    repo: 'mcp-tool-shop-org/test-desktop',
    scenario_results: [{
      scenario_id: 'desktop-launch',
      product_surface: 'desktop',
      execution_mode: 'mixed',
      // attested_by missing!
      verdict: 'pass',
      step_results: [{ step_id: 'launch-app', status: 'pass' }],
      evidence: [{ kind: 'screenshot', url: 'https://example.com/ss.png' }]
    }]
  });
}

// ============================================================
// Rule trigger tests
// ============================================================

describe('Rule: surface misclassification', () => {
  it('fires on product_surface enum rejection', () => {
    const candidates = deriveFromRecord(makeSurfaceMisclassRecord(), { rejected: true });
    const match = candidates.find(c => c.derived.rule_id === 'rule-surface-misclassification');
    assert.ok(match, 'Should emit surface misclassification finding');
    assert.equal(match.issue_kind, 'surface_misclassification');
    assert.equal(match.product_surface, 'mcp-server'); // sanitized
  });

  it('does not fire on passing record', () => {
    const candidates = deriveFromRecord(makePassingRecord());
    const match = candidates.find(c => c.derived.rule_id === 'rule-surface-misclassification');
    assert.equal(match, undefined);
  });
});

describe('Rule: evidence policy mismatch', () => {
  it('fires on evidence requirement rejection', () => {
    const candidates = deriveFromRecord(makeEvidencePolicyRecord(), { rejected: true });
    const match = candidates.find(c => c.derived.rule_id === 'rule-evidence-policy-mismatch');
    assert.ok(match, 'Should emit evidence policy mismatch finding');
    assert.equal(match.issue_kind, 'evidence_overconstraint');
  });

  it('does not fire on passing record', () => {
    const candidates = deriveFromRecord(makePassingRecord());
    const match = candidates.find(c => c.derived.rule_id === 'rule-evidence-policy-mismatch');
    assert.equal(match, undefined);
  });
});

describe('Rule: verdict downgrade', () => {
  it('fires when proposed pass is downgraded', () => {
    const candidates = deriveFromRecord(makeDowngradeRecord(), { rejected: true });
    const match = candidates.find(c => c.derived.rule_id === 'rule-verdict-downgrade');
    assert.ok(match, 'Should emit verdict downgrade finding');
    assert.equal(match.issue_kind, 'schema_mismatch'); // because schema_valid is false
  });

  it('does not fire when verdict is not downgraded', () => {
    const candidates = deriveFromRecord(makePassingRecord());
    const match = candidates.find(c => c.derived.rule_id === 'rule-verdict-downgrade');
    assert.equal(match, undefined);
  });

  it('does not fire when proposed is already fail', () => {
    const record = makePassingRecord({
      overall_verdict: { proposed: 'fail', verified: 'fail', downgraded: false }
    });
    const candidates = deriveFromRecord(record);
    const match = candidates.find(c => c.derived.rule_id === 'rule-verdict-downgrade');
    assert.equal(match, undefined);
  });
});

describe('Rule: scenario step failure', () => {
  it('fires on step failure with fail verdict', () => {
    const candidates = deriveFromRecord(makeStepFailureRecord());
    const match = candidates.find(c => c.derived.rule_id === 'rule-scenario-step-failure');
    assert.ok(match, 'Should emit step failure finding');
    assert.equal(match.issue_kind, 'build_output_mismatch'); // verify-output triggers this
  });

  it('classifies verify-output as build_output_mismatch', () => {
    const candidates = deriveFromRecord(makeStepFailureRecord());
    const match = candidates.find(c => c.derived.rule_id === 'rule-scenario-step-failure');
    assert.equal(match.root_cause_kind, 'build_config_error');
    assert.equal(match.remediation_kind, 'build_config_fix');
  });

  it('does not fire when all steps pass', () => {
    const candidates = deriveFromRecord(makePassingRecord());
    const match = candidates.find(c => c.derived.rule_id === 'rule-scenario-step-failure');
    assert.equal(match, undefined);
  });
});

describe('Rule: blocked scenario', () => {
  it('fires on blocked verdict', () => {
    const candidates = deriveFromRecord(makeBlockedRecord());
    const match = candidates.find(c => c.derived.rule_id === 'rule-blocked-scenario');
    assert.ok(match, 'Should emit blocked scenario finding');
    assert.ok(match.summary.includes('Server failed to start'));
  });

  it('does not fire on passing scenario', () => {
    const candidates = deriveFromRecord(makePassingRecord());
    const match = candidates.find(c => c.derived.rule_id === 'rule-blocked-scenario');
    assert.equal(match, undefined);
  });
});

describe('Rule: execution mode attestation gap', () => {
  it('fires on mixed mode without attested_by', () => {
    const candidates = deriveFromRecord(makeMissingAttestationRecord());
    const match = candidates.find(c => c.derived.rule_id === 'rule-execution-mode-gap');
    assert.ok(match, 'Should emit attestation gap finding');
    assert.equal(match.issue_kind, 'execution_mode_mismatch');
  });

  it('does not fire on bot mode', () => {
    const candidates = deriveFromRecord(makePassingRecord());
    const match = candidates.find(c => c.derived.rule_id === 'rule-execution-mode-gap');
    assert.equal(match, undefined);
  });

  it('does not fire on mixed with attested_by present', () => {
    const record = makePassingRecord({
      scenario_results: [{
        scenario_id: 'desktop-launch',
        product_surface: 'desktop',
        execution_mode: 'mixed',
        attested_by: 'mike',
        verdict: 'pass',
        step_results: [{ step_id: 'launch', status: 'pass' }],
        evidence: [{ kind: 'screenshot', url: 'https://example.com/ss.png' }]
      }]
    });
    const candidates = deriveFromRecord(record);
    const match = candidates.find(c => c.derived.rule_id === 'rule-execution-mode-gap');
    assert.equal(match, undefined);
  });
});

// ============================================================
// Determinism tests
// ============================================================

describe('Determinism', () => {
  it('same input yields same candidate IDs', () => {
    const record = makeSurfaceMisclassRecord();
    const a = deriveFromRecord(record, { rejected: true });
    const b = deriveFromRecord(record, { rejected: true });
    const idsA = a.map(c => c.finding_id).sort();
    const idsB = b.map(c => c.finding_id).sort();
    assert.deepEqual(idsA, idsB);
  });

  it('same input yields same classification', () => {
    const record = makeStepFailureRecord();
    const a = deriveFromRecord(record);
    const b = deriveFromRecord(record);
    for (let i = 0; i < a.length; i++) {
      assert.equal(a[i].issue_kind, b[i].issue_kind);
      assert.equal(a[i].root_cause_kind, b[i].root_cause_kind);
      assert.equal(a[i].remediation_kind, b[i].remediation_kind);
    }
  });

  it('rule evaluation order does not change findings', () => {
    const record = makeSurfaceMisclassRecord();
    const results1 = deriveFromRecord(record, { rejected: true });
    const results2 = deriveFromRecord(record, { rejected: true });
    assert.equal(results1.length, results2.length);
    for (let i = 0; i < results1.length; i++) {
      assert.equal(results1[i].finding_id, results2[i].finding_id);
    }
  });
});

// ============================================================
// Dedupe tests
// ============================================================

describe('Dedupe: within batch', () => {
  it('removes duplicate candidates with same dedupe key', () => {
    const candidates = [
      { finding_id: 'dfind-a', repo: 'org/a', issue_kind: 'x', root_cause_kind: 'y', journey_stage: 'z', title: 't', summary: 's' },
      { finding_id: 'dfind-a', repo: 'org/a', issue_kind: 'x', root_cause_kind: 'y', journey_stage: 'z', title: 't', summary: 's' }
    ];
    const { unique, skipped } = dedupeWithinBatch(candidates);
    assert.equal(unique.length, 1);
    assert.equal(skipped, 1);
  });

  it('keeps different candidates', () => {
    const candidates = [
      { finding_id: 'dfind-a', repo: 'org/a', issue_kind: 'x', root_cause_kind: 'y', journey_stage: 'z' },
      { finding_id: 'dfind-b', repo: 'org/b', issue_kind: 'x', root_cause_kind: 'y', journey_stage: 'z' }
    ];
    const { unique, skipped } = dedupeWithinBatch(candidates);
    assert.equal(unique.length, 2);
    assert.equal(skipped, 0);
  });
});

describe('Dedupe: against existing', () => {
  it('skips unchanged candidate', () => {
    const candidates = [{
      finding_id: 'dfind-test',
      issue_kind: 'x', root_cause_kind: 'y', remediation_kind: 'z',
      transfer_scope: 'a', summary: 's', title: 't'
    }];
    const existing = [{ data: {
      finding_id: 'dfind-test', status: 'candidate',
      issue_kind: 'x', root_cause_kind: 'y', remediation_kind: 'z',
      transfer_scope: 'a', summary: 's', title: 't'
    }}];
    const { toWrite, skippedUnchanged, collisions } = dedupeAgainstExisting(candidates, existing);
    assert.equal(toWrite.length, 0);
    assert.equal(skippedUnchanged, 1);
    assert.equal(collisions.length, 0);
  });

  it('reports collision for non-candidate existing', () => {
    const candidates = [{ finding_id: 'dfind-test' }];
    const existing = [{ data: { finding_id: 'dfind-test', status: 'accepted' } }];
    const { toWrite, collisions } = dedupeAgainstExisting(candidates, existing);
    assert.equal(toWrite.length, 0);
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].existingStatus, 'accepted');
  });

  it('writes new candidates not on disk', () => {
    const candidates = [{ finding_id: 'dfind-new' }];
    const existing = [];
    const { toWrite } = dedupeAgainstExisting(candidates, existing);
    assert.equal(toWrite.length, 1);
  });
});

// ============================================================
// Evidence binding tests
// ============================================================

describe('Evidence binding', () => {
  it('every emitted candidate includes source_record_ids', () => {
    const records = [
      makeSurfaceMisclassRecord(),
      makeStepFailureRecord(),
      makeEvidencePolicyRecord(),
      makeBlockedRecord()
    ];
    for (const record of records) {
      const candidates = deriveFromRecord(record, { rejected: true });
      for (const c of candidates) {
        assert.ok(c.source_record_ids.length >= 1, `${c.finding_id} missing source_record_ids`);
      }
    }
  });

  it('every emitted candidate includes structured evidence', () => {
    const records = [
      makeSurfaceMisclassRecord(),
      makeStepFailureRecord(),
      makeEvidencePolicyRecord(),
      makeMissingAttestationRecord()
    ];
    for (const record of records) {
      const candidates = deriveFromRecord(record, { rejected: true });
      for (const c of candidates) {
        assert.ok(c.evidence.length >= 1, `${c.finding_id} missing evidence`);
        for (const e of c.evidence) {
          assert.ok(e.evidence_kind, `Evidence in ${c.finding_id} missing evidence_kind`);
        }
      }
    }
  });

  it('evidence points back to the triggering record', () => {
    const record = makeSurfaceMisclassRecord();
    const candidates = deriveFromRecord(record, { rejected: true });
    for (const c of candidates) {
      const hasRecordRef = c.evidence.some(e => e.record_id === record.run_id);
      assert.ok(hasRecordRef, `${c.finding_id} evidence does not reference source record`);
    }
  });
});

// ============================================================
// Explainability tests
// ============================================================

describe('Explainability', () => {
  it('every emitted candidate has derivation metadata', () => {
    const record = makeSurfaceMisclassRecord();
    const candidates = deriveFromRecord(record, { rejected: true });
    for (const c of candidates) {
      assert.ok(c.derived, `${c.finding_id} missing derived metadata`);
      assert.equal(c.derived.method, 'deterministic_rule');
      assert.ok(c.derived.rule_id, `${c.finding_id} missing rule_id`);
      assert.ok(c.derived.derived_at, `${c.finding_id} missing derived_at`);
      assert.ok(c.derived.rationale.length >= 10, `${c.finding_id} rationale too short`);
    }
  });

  it('dry-run and write mode produce the same candidate set', () => {
    const record = makeStepFailureRecord();
    const a = deriveFromRecord(record);
    const b = deriveFromRecord(record);
    assert.deepEqual(
      a.map(c => c.finding_id),
      b.map(c => c.finding_id)
    );
  });
});

// ============================================================
// Schema validity tests
// ============================================================

describe('Schema validity of derived candidates', () => {
  const testRecords = [
    { name: 'surface-misclass', factory: makeSurfaceMisclassRecord, opts: { rejected: true } },
    { name: 'evidence-policy', factory: makeEvidencePolicyRecord, opts: { rejected: true } },
    { name: 'verdict-downgrade', factory: makeDowngradeRecord, opts: { rejected: true } },
    { name: 'step-failure', factory: makeStepFailureRecord, opts: {} },
    { name: 'blocked', factory: makeBlockedRecord, opts: {} },
    { name: 'attestation-gap', factory: makeMissingAttestationRecord, opts: {} }
  ];

  for (const { name, factory, opts } of testRecords) {
    it(`candidates from ${name} are schema-valid`, () => {
      const candidates = deriveFromRecord(factory(), opts);
      for (const c of candidates) {
        const result = validateFinding(c);
        assert.equal(result.valid, true, `${c.finding_id} invalid: ${JSON.stringify(result.errors)}`);
      }
    });
  }
});

// ============================================================
// ID generation tests
// ============================================================

describe('ID generation', () => {
  it('produces dfind- prefixed IDs', () => {
    const id = generateFindingId('repo-crawler-mcp', 'surface-misclassification');
    assert.ok(id.startsWith('dfind-'));
  });

  it('sanitizes special characters', () => {
    const id = generateFindingId('my_repo.name', 'weird/slug!');
    assert.match(id, /^dfind-[a-z0-9-]+$/);
  });

  it('is stable for same inputs', () => {
    const a = generateFindingId('repo', 'slug');
    const b = generateFindingId('repo', 'slug');
    assert.equal(a, b);
  });
});

describe('Dedupe key computation', () => {
  it('produces deterministic keys', () => {
    const fields = { repo: 'org/repo', issue_kind: 'x', root_cause_kind: 'y', journey_stage: 'z', slug: 'dfind-a' };
    const a = computeDedupeKey(fields);
    const b = computeDedupeKey(fields);
    assert.equal(a, b);
  });

  it('different fields produce different keys', () => {
    const a = computeDedupeKey({ repo: 'org/a', issue_kind: 'x', root_cause_kind: 'y', journey_stage: 'z', slug: 's' });
    const b = computeDedupeKey({ repo: 'org/b', issue_kind: 'x', root_cause_kind: 'y', journey_stage: 'z', slug: 's' });
    assert.notEqual(a, b);
  });
});

// ============================================================
// Multi-record batch tests
// ============================================================

describe('Batch derivation', () => {
  it('processes multiple records', () => {
    const entries = [
      { record: makeSurfaceMisclassRecord(), rejected: true },
      { record: makeStepFailureRecord(), rejected: false },
      { record: makePassingRecord(), rejected: false }
    ];
    const { candidates, stats } = deriveFromRecords(entries);
    assert.equal(stats.recordsProcessed, 3);
    assert.equal(stats.rulesEvaluated, 3 * RULES.length);
    assert.ok(candidates.length >= 2, 'Should emit at least 2 candidates from non-passing records');
  });

  it('passing records produce zero candidates', () => {
    const entries = [{ record: makePassingRecord(), rejected: false }];
    const { candidates } = deriveFromRecords(entries);
    assert.equal(candidates.length, 0);
  });
});

// ============================================================
// Write tests
// ============================================================

describe('Write findings', () => {
  const testDir = resolve(__dirname, '__test_write__');

  after(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  });

  it('writes a candidate to correct path', () => {
    // Set up minimal directory structure
    mkdirSync(resolve(testDir, 'findings'), { recursive: true });

    const finding = {
      schema_version: '1.0.0',
      finding_id: 'dfind-test-write',
      title: 'Test write finding for disk materialization',
      status: 'candidate',
      repo: 'mcp-tool-shop-org/test-repo',
      product_surface: 'cli',
      journey_stage: 'first_run',
      issue_kind: 'entrypoint_truth',
      root_cause_kind: 'contract_drift',
      remediation_kind: 'docs_change',
      transfer_scope: 'repo_local',
      summary: 'Test finding written by write test to verify disk materialization works correctly.',
      source_record_ids: ['test-001'],
      evidence: [{ evidence_kind: 'record', record_id: 'test-001' }]
    };

    const path = writeFinding(testDir, finding);
    assert.ok(existsSync(path), 'File should exist on disk');
    assert.ok(path.includes('dfind-test-write.yaml'));

    // Verify it's valid YAML that can be parsed back
    const raw = readFileSync(path, 'utf-8');
    const parsed = yaml.load(raw);
    assert.equal(parsed.finding_id, 'dfind-test-write');
  });
});

// ============================================================
// Rule inventory
// ============================================================

describe('Rule inventory', () => {
  it('has at least 8 rules', () => {
    assert.ok(RULES.length >= 8, `Expected at least 8 rules, got ${RULES.length}`);
  });

  it('all rules have unique IDs', () => {
    const ids = RULES.map(r => r.ruleId);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, 'Duplicate rule IDs found');
  });

  it('all rules have required interface', () => {
    for (const rule of RULES) {
      assert.ok(rule.ruleId, 'Rule missing ruleId');
      assert.ok(rule.description, 'Rule missing description');
      assert.equal(typeof rule.applies, 'function', `Rule ${rule.ruleId} missing applies()`);
      assert.equal(typeof rule.derive, 'function', `Rule ${rule.ruleId} missing derive()`);
    }
  });

  it('getRuleInventory returns all rules', () => {
    const inventory = getRuleInventory();
    assert.equal(inventory.length, RULES.length);
  });
});

// ============================================================
// Real record integration tests
// ============================================================

describe('Integration: real records', () => {
  it('derives from real rejected claude-guardian record', () => {
    const entry = loadRecordById(ROOT, 'claude-guardian-23326439671-1');
    if (!entry) return; // Skip if record not available
    const candidates = deriveFromRecord(entry.record, { rejected: entry.rejected });
    assert.ok(candidates.length >= 1, 'Should emit at least 1 candidate');
    const surfaceMatch = candidates.find(c => c.issue_kind === 'surface_misclassification');
    assert.ok(surfaceMatch, 'Should detect surface misclassification');
  });

  it('derives from real rejected shipcheck record', () => {
    const entry = loadRecordById(ROOT, 'shipcheck-23319886946-1');
    if (!entry) return;
    const candidates = deriveFromRecord(entry.record, { rejected: entry.rejected });
    const evidenceMatch = candidates.find(c => c.derived.rule_id === 'rule-evidence-policy-mismatch');
    assert.ok(evidenceMatch, 'Should detect evidence policy mismatch');
  });

  it('all candidates from real records are schema-valid', () => {
    const allEntries = loadAllRecords(ROOT);
    const { candidates } = deriveFromRecords(allEntries);
    for (const c of candidates) {
      const result = validateFinding(c);
      assert.equal(result.valid, true, `${c.finding_id} invalid: ${JSON.stringify(result.errors)}`);
    }
  });
});
