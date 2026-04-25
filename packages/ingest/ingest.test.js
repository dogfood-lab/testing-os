import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync, existsSync, mkdirSync, rmSync,
  readdirSync, copyFileSync
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ingest } from './run.js';
import { computeRecordPath, writeRecord } from './persist.js';
import { rebuildIndexes } from './rebuild-indexes.js';
import { stubProvenance, rejectingProvenance } from '@dogfood-lab/verify/validators/provenance.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const TEST_ROOT = resolve(__dirname, '__test_root__');
const FIXTURES = resolve(__dirname, '../verify/fixtures');

let pilot0;

function copyDirSync(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
    }
  }
}

function setupTestRoot() {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  copyDirSync(resolve(REPO_ROOT, 'policies'), resolve(TEST_ROOT, 'policies'));
  // Schemas live in the @dogfood-lab/schemas workspace package now.
  copyDirSync(resolve(REPO_ROOT, 'packages/schemas/src/json'), resolve(TEST_ROOT, 'schemas'));
  mkdirSync(resolve(TEST_ROOT, 'records'), { recursive: true });
  mkdirSync(resolve(TEST_ROOT, 'records', '_rejected'), { recursive: true });
  mkdirSync(resolve(TEST_ROOT, 'indexes'), { recursive: true });
}

before(() => {
  pilot0 = JSON.parse(readFileSync(resolve(FIXTURES, 'pilot-0-submission.json'), 'utf-8'));
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

// ── Persist Layer ──────────────────────────────────────────────

describe('persist layer', () => {
  it('computes correct accepted path', () => {
    const record = {
      run_id: 'test-run-001',
      repo: 'mcp-tool-shop-org/dogfood-labs',
      timing: { finished_at: '2026-03-19T15:45:12Z' },
      verification: { status: 'accepted' }
    };
    const path = computeRecordPath(record, '/repo');
    assert.match(path, /records[/\\]mcp-tool-shop-org[/\\]dogfood-labs[/\\]2026[/\\]03[/\\]19[/\\]run-test-run-001\.json/);
    assert.ok(!path.includes('_rejected'));
  });

  it('computes correct rejected path', () => {
    const record = {
      run_id: 'test-run-001',
      repo: 'mcp-tool-shop-org/dogfood-labs',
      timing: { finished_at: '2026-03-19T15:45:12Z' },
      verification: { status: 'rejected' }
    };
    const path = computeRecordPath(record, '/repo');
    assert.match(path, /_rejected[/\\]mcp-tool-shop-org/);
  });

  it('writes record atomically (no temp files left)', () => {
    setupTestRoot();
    const record = {
      run_id: 'atomic-test-001',
      repo: 'mcp-tool-shop-org/dogfood-labs',
      timing: { finished_at: '2026-03-19T15:45:12Z' },
      verification: { status: 'accepted' }
    };
    const { path, written } = writeRecord(record, TEST_ROOT);
    assert.ok(written);
    assert.ok(existsSync(path));
    // No .tmp files should remain
    const dir = dirname(path);
    const files = readdirSync(dir);
    assert.ok(files.every(f => !f.endsWith('.tmp')));
  });
});

// ── Full Pipeline ──────────────────────────────────────────────

describe('ingestion pipeline', () => {
  it('1. accepted path: valid dispatch → record in accepted path → indexes updated', async () => {
    setupTestRoot();
    const result = await ingest(pilot0, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance
    });

    assert.equal(result.duplicate, false);
    assert.equal(result.written, true);
    assert.equal(result.record.verification.status, 'accepted');
    assert.ok(existsSync(result.path));
    assert.ok(!result.path.includes('_rejected'));

    // Verify indexes were generated
    const latestPath = resolve(TEST_ROOT, 'indexes', 'latest-by-repo.json');
    assert.ok(existsSync(latestPath));
    const latest = JSON.parse(readFileSync(latestPath, 'utf-8'));
    assert.ok(latest['mcp-tool-shop-org/dogfood-labs']);
    assert.ok(latest['mcp-tool-shop-org/dogfood-labs']['cli']);
    assert.equal(latest['mcp-tool-shop-org/dogfood-labs']['cli'].run_id, pilot0.run_id);
    assert.equal(latest['mcp-tool-shop-org/dogfood-labs']['cli'].verified, 'pass');
  });

  it('2. rejected path: failed verification → record in _rejected path', async () => {
    setupTestRoot();
    const result = await ingest(pilot0, {
      repoRoot: TEST_ROOT,
      provenance: rejectingProvenance
    });

    assert.equal(result.duplicate, false);
    assert.equal(result.written, true);
    assert.equal(result.record.verification.status, 'rejected');
    assert.ok(result.path.includes('_rejected'));
    assert.ok(existsSync(result.path));
  });

  it('3. duplicate dispatch: same run_id twice → second is no-op', async () => {
    setupTestRoot();

    // First ingest
    const first = await ingest(pilot0, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance
    });
    assert.equal(first.written, true);
    assert.equal(first.duplicate, false);

    // Second ingest (same run_id)
    const second = await ingest(pilot0, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance
    });
    assert.equal(second.duplicate, true);
    assert.equal(second.written, false);
    assert.equal(second.record, null);
  });

  it('4. missing repo policy: accepted with global defaults, not crash', async () => {
    setupTestRoot();
    const submission = structuredClone(pilot0);
    submission.repo = 'mcp-tool-shop-org/unknown-repo';
    submission.run_id = 'missing-policy-001';

    const result = await ingest(submission, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance
    });

    // Should not crash — global policy applies
    assert.equal(result.duplicate, false);
    assert.ok(result.record);
    // May be accepted or rejected depending on global defaults,
    // but must not throw
    assert.ok(['accepted', 'rejected'].includes(result.record.verification.status));
  });

  it('5. missing scenario definition: rejected record, not crash', async () => {
    setupTestRoot();

    // Use a scenario fetcher that returns null for all scenarios
    const emptyFetcher = { async fetch() { return null; } };

    const result = await ingest(pilot0, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance,
      scenarioFetcher: emptyFetcher
    });

    assert.equal(result.duplicate, false);
    assert.ok(result.record);
    assert.equal(result.record.verification.status, 'rejected');
    assert.ok(
      result.record.verification.rejection_reasons.some(r => r.includes('scenario-load'))
    );
  });

  it('6. index correctness: latest-by-repo picks newest per repo+surface', async () => {
    setupTestRoot();

    // Ingest first (older)
    const older = structuredClone(pilot0);
    older.run_id = 'older-run';
    older.timing.finished_at = '2026-03-18T10:00:00Z';
    older.timing.started_at = '2026-03-18T09:59:00Z';

    await ingest(older, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance
    });

    // Ingest second (newer)
    const newer = structuredClone(pilot0);
    newer.run_id = 'newer-run';
    newer.timing.finished_at = '2026-03-19T15:45:12Z';
    newer.timing.started_at = '2026-03-19T15:45:00Z';

    await ingest(newer, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance
    });

    const latest = JSON.parse(
      readFileSync(resolve(TEST_ROOT, 'indexes', 'latest-by-repo.json'), 'utf-8')
    );
    const entry = latest['mcp-tool-shop-org/dogfood-labs']['cli'];
    assert.equal(entry.run_id, 'newer-run');
  });

  it('7. persisted record is valid JSON', async () => {
    setupTestRoot();
    const result = await ingest(pilot0, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance
    });

    const raw = readFileSync(result.path, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.run_id, pilot0.run_id);
    assert.ok(parsed.verification);
    assert.ok(parsed.overall_verdict.proposed);
    assert.ok(parsed.overall_verdict.verified);
  });

  it('8. indexes include failing and stale arrays', async () => {
    setupTestRoot();

    // Ingest a failing record
    const failing = structuredClone(pilot0);
    failing.run_id = 'failing-run';
    failing.overall_verdict = 'fail';
    failing.scenario_results[0].verdict = 'fail';
    failing.scenario_results[0].step_results[0].status = 'fail';

    await ingest(failing, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance
    });

    const failingIndex = JSON.parse(
      readFileSync(resolve(TEST_ROOT, 'indexes', 'failing.json'), 'utf-8')
    );
    assert.ok(Array.isArray(failingIndex));
    assert.ok(failingIndex.length > 0);
    assert.equal(failingIndex[0].verified, 'fail');

    const staleIndex = JSON.parse(
      readFileSync(resolve(TEST_ROOT, 'indexes', 'stale.json'), 'utf-8')
    );
    assert.ok(Array.isArray(staleIndex));
  });
});

// ── Provenance Guards (lockdown regression tests) ─────────────

describe('provenance guards', () => {
  it('rejects ingestion when no provenance adapter is provided', async () => {
    setupTestRoot();
    await assert.rejects(
      () => ingest(pilot0, { repoRoot: TEST_ROOT }),
      { message: /Provenance adapter is required/ }
    );
  });

  it('rejects ingestion when provenance is null', async () => {
    setupTestRoot();
    await assert.rejects(
      () => ingest(pilot0, { repoRoot: TEST_ROOT, provenance: null }),
      { message: /Provenance adapter is required/ }
    );
  });

  it('rejects ingestion when provenance has no confirm method', async () => {
    setupTestRoot();
    await assert.rejects(
      () => ingest(pilot0, { repoRoot: TEST_ROOT, provenance: {} }),
      { message: /Provenance adapter is required/ }
    );
  });

  it('accepts ingestion when stubProvenance is explicitly passed', async () => {
    setupTestRoot();
    const result = await ingest(pilot0, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance
    });
    assert.equal(result.duplicate, false);
    assert.equal(result.written, true);
  });

  it('rejects ingestion with rejectingProvenance', async () => {
    setupTestRoot();
    const result = await ingest(pilot0, {
      repoRoot: TEST_ROOT,
      provenance: rejectingProvenance
    });
    assert.equal(result.record.verification.status, 'rejected');
    assert.ok(result.record.verification.rejection_reasons.some(
      r => r.includes('provenance')
    ));
  });
});

// ── Index Generator ────────────────────────────────────────────

describe('index generator', () => {
  it('produces empty indexes for empty records dir', () => {
    setupTestRoot();
    const { latestByRepo, failing, stale } = rebuildIndexes(TEST_ROOT);
    assert.deepEqual(latestByRepo, {});
    assert.deepEqual(failing, []);
    assert.deepEqual(stale, []);
  });
});
