import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildSubmission, precheckSubmission } from './build-submission.js';

const BASE_PARAMS = {
  repo: 'mcp-tool-shop-org/dogfood-labs',
  commitSha: 'a'.repeat(40),
  branch: 'main',
  workflow: 'dogfood.yml',
  providerRunId: '12345',
  runUrl: 'https://github.com/mcp-tool-shop-org/dogfood-labs/actions/runs/12345',
  actor: 'ci-bot',
  startedAt: '2026-03-19T15:00:00Z',
  finishedAt: '2026-03-19T15:01:00Z',
  scenarioResults: [
    {
      scenario_id: 'record-ingest-roundtrip',
      scenario_name: 'Record ingest roundtrip',
      scenario_version: '1.0.0',
      product_surface: 'cli',
      execution_mode: 'bot',
      verdict: 'pass',
      step_results: [
        { step_id: 'emit-submission', status: 'pass' },
        { step_id: 'verify-schema', status: 'pass' }
      ],
      evidence: [
        { kind: 'log', url: 'https://example.com/log' }
      ]
    }
  ],
  overallVerdict: 'pass',
  notes: 'Test run'
};

// ── Builder ────────────────────────────────────────────────────

describe('submission builder', () => {
  it('builds a valid submission from params', () => {
    const submission = buildSubmission(BASE_PARAMS);

    assert.equal(submission.schema_version, '1.0.0');
    assert.ok(submission.run_id);
    assert.equal(submission.repo, 'mcp-tool-shop-org/dogfood-labs');
    assert.equal(submission.ref.commit_sha, 'a'.repeat(40));
    assert.equal(submission.source.provider, 'github');
    assert.equal(submission.source.provider_run_id, '12345');
    assert.equal(submission.overall_verdict, 'pass');
    assert.equal(submission.scenario_results.length, 1);
    assert.equal(submission.timing.duration_ms, 60000);
  });

  it('generates unique run_ids', () => {
    const a = buildSubmission(BASE_PARAMS);
    const b = buildSubmission(BASE_PARAMS);
    assert.notEqual(a.run_id, b.run_id);
  });

  it('omits optional fields when not provided', () => {
    const minimal = buildSubmission({
      ...BASE_PARAMS,
      version: undefined,
      ciChecks: undefined,
      notes: undefined
    });
    assert.ok(!('version' in minimal.ref));
    assert.ok(!('ci_checks' in minimal));
    assert.ok(!('notes' in minimal));
  });

  it('includes ci_checks when provided', () => {
    const withCI = buildSubmission({
      ...BASE_PARAMS,
      ciChecks: [{ id: 'tests', kind: 'test', status: 'pass', value: 10 }]
    });
    assert.equal(withCI.ci_checks.length, 1);
  });
});

// ── Precheck ───────────────────────────────────────────────────

describe('submission precheck', () => {
  it('passes valid submission', () => {
    const submission = buildSubmission(BASE_PARAMS);
    const result = precheckSubmission(submission);
    assert.equal(result.valid, true, `errors: ${result.errors.join(', ')}`);
  });

  it('rejects missing schema_version', () => {
    const bad = buildSubmission(BASE_PARAMS);
    delete bad.schema_version;
    const result = precheckSubmission(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('schema_version')));
  });

  it('rejects missing scenario_results', () => {
    const bad = buildSubmission(BASE_PARAMS);
    bad.scenario_results = [];
    const result = precheckSubmission(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('scenario_results')));
  });

  it('rejects verifier-owned field: policy_version', () => {
    const bad = buildSubmission(BASE_PARAMS);
    bad.policy_version = '1.0.0';
    const result = precheckSubmission(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('policy_version')));
  });

  it('rejects verifier-owned field: verification', () => {
    const bad = buildSubmission(BASE_PARAMS);
    bad.verification = { status: 'accepted' };
    const result = precheckSubmission(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('verification')));
  });

  it('rejects overall_verdict as object', () => {
    const bad = buildSubmission(BASE_PARAMS);
    bad.overall_verdict = { proposed: 'pass', verified: 'pass' };
    const result = precheckSubmission(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('overall_verdict')));
  });

  it('rejects missing commit_sha', () => {
    const bad = buildSubmission(BASE_PARAMS);
    delete bad.ref.commit_sha;
    const result = precheckSubmission(bad);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('commit_sha')));
  });

  it('passes mixed/human submission with attested_by and evidence', () => {
    const mixed = buildSubmission({
      ...BASE_PARAMS,
      scenarioResults: [
        {
          scenario_id: 'export-roundtrip-16x16',
          scenario_name: 'Export roundtrip',
          scenario_version: '1.0.0',
          product_surface: 'desktop',
          execution_mode: 'mixed',
          attested_by: 'mike',
          verdict: 'pass',
          step_results: [
            { step_id: 'export-png', status: 'pass' },
            { step_id: 'reimport', status: 'pass' }
          ],
          evidence: [
            { kind: 'screenshot', url: 'https://example.com/screenshot.png' },
            { kind: 'artifact', url: 'https://example.com/export.png' }
          ],
          notes: 'Manual export verified'
        }
      ]
    });
    const result = precheckSubmission(mixed);
    assert.equal(result.valid, true, `errors: ${result.errors.join(', ')}`);
    assert.equal(mixed.scenario_results[0].attested_by, 'mike');
    assert.equal(mixed.scenario_results[0].evidence.length, 2);
  });
});
