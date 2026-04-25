import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

import { verify } from './index.js';
import { validateSubmissionSchema } from './validators/schema.js';
import { validateStepResults } from './validators/steps.js';
import { validatePolicy } from './validators/policy.js';
import { computeVerdict } from './validators/verdict.js';
import { stubProvenance, rejectingProvenance } from './validators/provenance.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, 'fixtures');
const POLICIES = resolve(__dirname, '../../policies');

let pilot0;
let globalPolicy;
let repoPolicy;

before(() => {
  pilot0 = JSON.parse(readFileSync(resolve(FIXTURES, 'pilot-0-submission.json'), 'utf-8'));
  globalPolicy = yaml.load(readFileSync(resolve(POLICIES, 'global-policy.yaml'), 'utf-8'));
  repoPolicy = yaml.load(
    readFileSync(resolve(POLICIES, 'repos/mcp-tool-shop-org/dogfood-labs.yaml'), 'utf-8')
  );
});

// ── Schema Validation ──────────────────────────────────────────

describe('schema validation', () => {
  it('accepts a valid pilot-0 submission', () => {
    const result = validateSubmissionSchema(pilot0);
    assert.equal(result.valid, true, `errors: ${result.errors.join(', ')}`);
  });

  it('rejects submission missing required fields', () => {
    const result = validateSubmissionSchema({ schema_version: '1.0.0' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('rejects submission with invalid commit_sha pattern', () => {
    const bad = structuredClone(pilot0);
    bad.ref.commit_sha = 'not-a-sha';
    const result = validateSubmissionSchema(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('commit_sha')));
  });

  it('rejects submission with empty scenario_results', () => {
    const bad = structuredClone(pilot0);
    bad.scenario_results = [];
    const result = validateSubmissionSchema(bad);
    assert.equal(result.valid, false);
  });

  it('rejects submission with invalid overall_verdict type', () => {
    const bad = structuredClone(pilot0);
    bad.overall_verdict = { proposed: 'pass', verified: 'pass' };
    const result = validateSubmissionSchema(bad);
    assert.equal(result.valid, false);
  });
});

// ── Step Results Validation ────────────────────────────────────

describe('step results validation', () => {
  it('passes for valid step results', () => {
    const errors = validateStepResults(pilot0.scenario_results[0]);
    assert.deepEqual(errors, []);
  });

  it('rejects empty step_results', () => {
    const bad = { ...pilot0.scenario_results[0], step_results: [] };
    const errors = validateStepResults(bad);
    assert.ok(errors.length > 0);
  });

  it('rejects duplicate step IDs', () => {
    const bad = structuredClone(pilot0.scenario_results[0]);
    bad.step_results.push({ step_id: 'emit-submission', status: 'pass' });
    const errors = validateStepResults(bad);
    assert.ok(errors.some(e => e.includes('duplicate')));
  });

  it('rejects pass verdict when a step is fail', () => {
    const bad = structuredClone(pilot0.scenario_results[0]);
    bad.verdict = 'pass';
    bad.step_results[0].status = 'fail';
    const errors = validateStepResults(bad);
    assert.ok(errors.some(e => e.includes('fail')));
  });

  it('allows partial verdict with failing steps', () => {
    const scenario = structuredClone(pilot0.scenario_results[0]);
    scenario.verdict = 'partial';
    scenario.step_results[0].status = 'fail';
    const errors = validateStepResults(scenario);
    assert.deepEqual(errors, []);
  });
});

// ── Policy Validation ──────────────────────────────────────────

describe('policy validation', () => {
  it('passes for valid pilot-0 submission', () => {
    const result = validatePolicy(pilot0, { globalPolicy, repoPolicy });
    assert.equal(result.valid, true, `errors: ${result.errors.join(', ')}`);
  });

  it('rejects human execution_mode without attested_by', () => {
    const bad = structuredClone(pilot0);
    bad.scenario_results[0].execution_mode = 'human';
    // no attested_by
    const result = validatePolicy(bad, { globalPolicy, repoPolicy });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('attested-if-human')));
  });

  it('passes human execution_mode with attested_by', () => {
    const good = structuredClone(pilot0);
    good.scenario_results[0].execution_mode = 'human';
    good.scenario_results[0].attested_by = 'mike';
    // Note: dogfood-labs policy only allows bot mode for cli surface,
    // so this will fail on execution_mode_policy, not attestation
    const result = validatePolicy(good, { globalPolicy, repoPolicy });
    assert.ok(result.errors.some(e => e.includes('execution_mode')) || result.valid);
  });

  it('rejects blocked verdict without blocking_reason', () => {
    const bad = structuredClone(pilot0);
    bad.scenario_results[0].verdict = 'blocked';
    const result = validatePolicy(bad, { globalPolicy, repoPolicy });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('blocked-needs-reason')));
  });

  it('rejects when evidence requirements not met', () => {
    const bad = structuredClone(pilot0);
    bad.scenario_results[0].evidence = [];
    const result = validatePolicy(bad, { globalPolicy, repoPolicy });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('evidence')));
  });

  it('rejects disallowed execution_mode per surface policy', () => {
    const bad = structuredClone(pilot0);
    bad.scenario_results[0].execution_mode = 'human';
    bad.scenario_results[0].attested_by = 'mike';
    const result = validatePolicy(bad, { globalPolicy, repoPolicy });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('execution_mode')));
  });

  it('rejects failing CI tests when tests_must_pass is true', () => {
    const bad = structuredClone(pilot0);
    bad.ci_checks = [{ id: 'unit-tests', kind: 'test', status: 'fail', value: 20 }];
    const result = validatePolicy(bad, { globalPolicy, repoPolicy });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('CI tests must pass')));
  });
});

// ── Verdict Computation ────────────────────────────────────────

describe('verdict computation', () => {
  it('confirms pass when everything passes', () => {
    const result = computeVerdict('pass', {
      schemaValid: true,
      policyValid: true,
      provenanceConfirmed: true,
      scenarioResults: [{ verdict: 'pass' }],
      reasons: []
    });
    assert.equal(result.verified, 'pass');
    assert.equal(result.downgraded, false);
  });

  it('downgrades pass to fail when policy fails', () => {
    const result = computeVerdict('pass', {
      schemaValid: true,
      policyValid: false,
      provenanceConfirmed: true,
      scenarioResults: [{ verdict: 'pass' }],
      reasons: ['policy: something']
    });
    assert.equal(result.verified, 'fail');
    assert.equal(result.downgraded, true);
    assert.ok(result.downgrade_reasons.length > 0);
  });

  it('downgrades pass to fail when provenance fails', () => {
    const result = computeVerdict('pass', {
      schemaValid: true,
      policyValid: true,
      provenanceConfirmed: false,
      scenarioResults: [{ verdict: 'pass' }],
      reasons: []
    });
    assert.equal(result.verified, 'fail');
    assert.equal(result.downgraded, true);
  });

  it('never upgrades a proposed fail', () => {
    const result = computeVerdict('fail', {
      schemaValid: true,
      policyValid: true,
      provenanceConfirmed: true,
      scenarioResults: [{ verdict: 'pass' }],
      reasons: []
    });
    assert.equal(result.verified, 'fail');
    assert.equal(result.downgraded, false);
  });

  it('downgrades pass to partial when worst scenario is partial', () => {
    const result = computeVerdict('pass', {
      schemaValid: true,
      policyValid: true,
      provenanceConfirmed: true,
      scenarioResults: [{ verdict: 'pass' }, { verdict: 'partial' }],
      reasons: []
    });
    assert.equal(result.verified, 'partial');
    assert.equal(result.downgraded, true);
  });

  it('downgrades pass to blocked when a scenario is blocked', () => {
    const result = computeVerdict('pass', {
      schemaValid: true,
      policyValid: true,
      provenanceConfirmed: true,
      scenarioResults: [{ verdict: 'blocked' }],
      reasons: []
    });
    assert.equal(result.verified, 'blocked');
    assert.equal(result.downgraded, true);
  });
});

// ── Full Verifier Pipeline (Pilot 0) ──────────────────────────

describe('full verifier pipeline (pilot 0)', () => {
  it('accepts a valid pilot-0 submission', async () => {
    const record = await verify(pilot0, {
      globalPolicy,
      repoPolicy,
      provenance: stubProvenance,
      policyVersion: '1.0.0'
    });

    assert.equal(record.verification.status, 'accepted');
    assert.equal(record.verification.schema_valid, true);
    assert.equal(record.verification.policy_valid, true);
    assert.equal(record.verification.provenance_confirmed, true);
    assert.equal(record.overall_verdict.proposed, 'pass');
    assert.equal(record.overall_verdict.verified, 'pass');
    assert.equal(record.overall_verdict.downgraded, false);
    assert.equal(record.policy_version, '1.0.0');
    assert.equal(record.run_id, pilot0.run_id);
    assert.equal(record.repo, pilot0.repo);
    assert.deepEqual(record.rejection_reasons, undefined);
    assert.deepEqual(record.verification.rejection_reasons, []);
  });

  it('rejects when provenance fails', async () => {
    const record = await verify(pilot0, {
      globalPolicy,
      repoPolicy,
      provenance: rejectingProvenance,
      policyVersion: '1.0.0'
    });

    assert.equal(record.verification.status, 'rejected');
    assert.equal(record.verification.provenance_confirmed, false);
    assert.equal(record.overall_verdict.verified, 'fail');
    assert.equal(record.overall_verdict.downgraded, true);
    assert.ok(record.verification.rejection_reasons.some(r => r.includes('provenance')));
  });

  it('rejects when submission contains verifier-owned fields', async () => {
    const bad = { ...structuredClone(pilot0), policy_version: '1.0.0' };
    const record = await verify(bad, {
      globalPolicy,
      repoPolicy,
      provenance: stubProvenance,
      policyVersion: '1.0.0'
    });

    assert.equal(record.verification.status, 'rejected');
    assert.ok(
      record.verification.rejection_reasons.some(r => r.includes('verifier-field'))
    );
  });

  it('rejects malformed submission', async () => {
    const record = await verify({ schema_version: '1.0.0' }, {
      globalPolicy,
      repoPolicy,
      provenance: stubProvenance,
      policyVersion: '1.0.0'
    });

    assert.equal(record.verification.status, 'rejected');
    assert.equal(record.verification.schema_valid, false);
  });

  it('sets all verifier-owned fields on persisted record', async () => {
    const record = await verify(pilot0, {
      globalPolicy,
      repoPolicy,
      provenance: stubProvenance,
      policyVersion: '1.0.0'
    });

    // Verifier-owned fields present
    assert.ok(record.policy_version);
    assert.ok(record.verification);
    assert.ok(record.verification.verified_at);
    assert.ok(typeof record.verification.provenance_confirmed === 'boolean');
    assert.ok(typeof record.verification.schema_valid === 'boolean');
    assert.ok(typeof record.verification.policy_valid === 'boolean');
    assert.ok(record.overall_verdict.proposed);
    assert.ok(record.overall_verdict.verified);
    assert.ok(typeof record.overall_verdict.downgraded === 'boolean');
  });

  it('carries through source-authored fields unchanged', async () => {
    const record = await verify(pilot0, {
      globalPolicy,
      repoPolicy,
      provenance: stubProvenance,
      policyVersion: '1.0.0'
    });

    assert.equal(record.run_id, pilot0.run_id);
    assert.equal(record.repo, pilot0.repo);
    assert.deepEqual(record.ref, pilot0.ref);
    assert.deepEqual(record.source, pilot0.source);
    assert.deepEqual(record.timing, pilot0.timing);
    assert.deepEqual(record.ci_checks, pilot0.ci_checks);
    assert.equal(record.notes, pilot0.notes);
  });
});
