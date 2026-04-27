/**
 * verify-only-and-correlation.test.js
 *
 * Coverage for two foundational pipeline primitives that landed together:
 *
 *   F-252714-058 (FT-PIPELINE-001) — public `--verify-only` entrypoint:
 *     Run the full verify+policy+provenance pipeline and return the would-be
 *     record without touching the filesystem or rebuilding indexes.
 *     Operators get a `would_persist_to: <path>` field so they see exactly
 *     where a real ingest WOULD have landed.
 *
 *   F-252714-061 (FT-PIPELINE-004) — pipeline-stage correlation IDs:
 *     A single `correlation_id` propagates through every logStage call in
 *     a single ingest run, so a downstream log aggregator can pivot a
 *     multi-line NDJSON stream into a per-submission trace. For valid
 *     submissions `correlation_id == run_id` (operator pivots stay on the
 *     user-meaningful key); for invalid/malformed submissions a synthetic
 *     `ing-<base36-ts>-<rand4>` is generated.
 *
 * The two invariants are tested together because they interact:
 * verify-only events MUST emit WITH correlation_id (the field is pinned
 * across the wrapper for both ingest() and verifyOnly()).
 */

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFileSync, existsSync, mkdirSync, rmSync,
  readdirSync, copyFileSync
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { ingest, verifyOnly } from './run.js';
import { computeRecordPath } from './persist.js';
import { stubProvenance } from '@dogfood-lab/verify/validators/provenance.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
// Distinct from ingest.test.js's __test_root__ so node --test parallel
// execution can't make these two files step on each other's setup/teardown.
const TEST_ROOT = resolve(__dirname, '__test_root_verify_only__');
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

/**
 * Capture stderr while running an async function. Returns the captured
 * chunks so tests can parse the NDJSON stage-transition lines emitted by
 * logStage. We restore the real stderr.write in `finally` so a failed
 * assertion doesn't leak the stub into other tests.
 */
async function captureStderr(fn) {
  const captured = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    captured.push(chunk.toString());
    return true;
  };
  try {
    return { result: await fn(), captured };
  } finally {
    process.stderr.write = orig;
  }
}

/**
 * Parse the NDJSON stage-transition lines out of a captured stderr stream.
 * Filters out any non-JSON lines (e.g., the wave-17 human-readable banner
 * when a TTY-style env is set during `npm test --watch`).
 */
function parseStageEvents(captured) {
  const events = [];
  for (const chunk of captured) {
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.stage) events.push(parsed);
      } catch {
        // Tolerate any captured chunk that isn't structured logStage output.
      }
    }
  }
  return events;
}

// ─────────────────────────────────────────────────────────────────
// F-252714-058 — verify-only public entrypoint
// ─────────────────────────────────────────────────────────────────

describe('F-252714-058 — verifyOnly() runs the pipeline without persisting', () => {
  it('valid submission: returns assembled record + would_persist_to, no files written', async () => {
    setupTestRoot();
    const recordsDirBefore = readdirSync(resolve(TEST_ROOT, 'records'));
    const indexesDirBefore = readdirSync(resolve(TEST_ROOT, 'indexes'));

    const result = await verifyOnly(pilot0, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance
    });

    assert.equal(result.verify_only, true);
    assert.ok(result.record, 'record must be assembled');
    assert.equal(result.record.verification.status, 'accepted');
    assert.equal(result.record.run_id, pilot0.run_id);

    // would_persist_to MUST match what computeRecordPath would have produced.
    assert.equal(typeof result.would_persist_to, 'string');
    assert.equal(
      result.would_persist_to,
      computeRecordPath(result.record, TEST_ROOT),
      'would_persist_to must match computeRecordPath() output exactly'
    );
    assert.ok(!existsSync(result.would_persist_to), 'no file at would_persist_to');

    // Side-effect-free: filesystem is untouched.
    const recordsDirAfter = readdirSync(resolve(TEST_ROOT, 'records'));
    const indexesDirAfter = readdirSync(resolve(TEST_ROOT, 'indexes'));
    assert.deepEqual(recordsDirAfter, recordsDirBefore, 'records/ unchanged');
    assert.deepEqual(indexesDirAfter, indexesDirBefore, 'indexes/ unchanged');
  });

  it('invalid submission (null): returns rejection record + null would_persist_to, no crash', async () => {
    setupTestRoot();

    const result = await verifyOnly(null, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance
    });

    assert.equal(result.verify_only, true);
    assert.equal(result.record.verification.status, 'rejected');
    assert.ok(result.record.verification.rejection_reasons.length > 0);
    assert.equal(result.would_persist_to, null,
      'null/non-object input has no computeRecordPath — would_persist_to is null');
  });

  it('emits same logStage stages as ingest minus persist/rebuild_indexes_complete', async () => {
    setupTestRoot();

    const { captured } = await captureStderr(() =>
      verifyOnly(pilot0, { repoRoot: TEST_ROOT, provenance: stubProvenance })
    );
    const stages = parseStageEvents(captured).map(e => e.stage);

    // Verify-only emits dispatch_received, context_loaded, verify_complete,
    // and verify_only_complete — and NEVER persist_complete or
    // rebuild_indexes_complete (which would lie about persistence).
    assert.deepEqual(stages, [
      'dispatch_received',
      'context_loaded',
      'verify_complete',
      'verify_only_complete'
    ]);
  });

  it('would_persist_to matches what a real ingest of the same submission produces', async () => {
    setupTestRoot();

    // First: verify-only.
    const dryRun = await verifyOnly(pilot0, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance
    });

    // Then: real ingest of the same submission. The path it lands at MUST
    // match what verify-only previewed.
    const real = await ingest(pilot0, {
      repoRoot: TEST_ROOT,
      provenance: stubProvenance
    });

    assert.equal(dryRun.would_persist_to, real.path,
      'would_persist_to must match the real-ingest path byte-for-byte');
  });

  it('verify_only_complete event carries would_persist_to', async () => {
    setupTestRoot();

    const { captured } = await captureStderr(() =>
      verifyOnly(pilot0, { repoRoot: TEST_ROOT, provenance: stubProvenance })
    );
    const events = parseStageEvents(captured);
    const completion = events.find(e => e.stage === 'verify_only_complete');
    assert.ok(completion, 'verify_only_complete event must fire');
    assert.equal(typeof completion.would_persist_to, 'string');
    assert.equal(completion.status, 'accepted');
  });
});

// ─────────────────────────────────────────────────────────────────
// F-252714-058 — CLI flag wiring
// ─────────────────────────────────────────────────────────────────

describe('F-252714-058 — --verify-only CLI flag', () => {
  it('CLI emits would_persist_to and writes nothing on disk', () => {
    setupTestRoot();
    const recordsDirBefore = readdirSync(resolve(TEST_ROOT, 'records'));

    // Run the CLI with --verify-only and pipe a valid submission via stdin.
    // Override repoRoot via INGEST_TEST_ROOT? No — run.js hard-codes repoRoot
    // to `resolve(__dirname, '../..')`. We feed the real repo's submission
    // via stdin and trust that --verify-only suppresses ALL writes; the
    // assertion is that TEST_ROOT remains untouched (we never pointed the
    // CLI at it). The contract under test here is the CLI surface itself:
    //   - flag parses
    //   - JSON output includes verify_only=true and would_persist_to
    //   - exit code is 0 for accepted
    const child = spawnSync(process.execPath, [
      resolve(__dirname, 'run.js'),
      '--verify-only',
      '--provenance', 'stub'
    ], {
      input: JSON.stringify(pilot0),
      encoding: 'utf-8',
      env: { ...process.env, CI: '', GITHUB_ACTIONS: '' }
    });

    assert.equal(child.status, 0,
      `CLI exited non-zero (stdout: ${child.stdout}, stderr: ${child.stderr})`);
    const out = JSON.parse(child.stdout.trim());
    assert.equal(out.verify_only, true);
    assert.equal(out.status, 'accepted');
    assert.equal(out.run_id, pilot0.run_id);
    assert.equal(typeof out.would_persist_to, 'string');
    assert.ok(out.would_persist_to.includes(pilot0.run_id),
      'would_persist_to filename should mention the run_id');

    // No `path` field (that's an ingest-only field).
    assert.equal(out.path, undefined);
    assert.equal(out.written, undefined);

    // The TEST_ROOT we set up — for the parallel ingest tests — is not the
    // CLI's actual target, so this is a sanity assertion that nothing leaked.
    const recordsDirAfter = readdirSync(resolve(TEST_ROOT, 'records'));
    assert.deepEqual(recordsDirAfter, recordsDirBefore);
  });

  it('CLI exits 1 when verify-only sees a rejection (same code as real ingest)', () => {
    setupTestRoot();

    // Submission with a forged repo / run_url mismatch — verify rejects.
    const bad = structuredClone(pilot0);
    bad.repo = 'attacker-org/victim-repo'; // mismatches source.run_url

    const child = spawnSync(process.execPath, [
      resolve(__dirname, 'run.js'),
      '--verify-only',
      '--provenance', 'stub'
    ], {
      input: JSON.stringify(bad),
      encoding: 'utf-8',
      env: { ...process.env, CI: '', GITHUB_ACTIONS: '' }
    });

    assert.equal(child.status, 1,
      `verify-only on a rejection should exit 1 (stdout: ${child.stdout})`);
    const out = JSON.parse(child.stdout.trim());
    assert.equal(out.verify_only, true);
    assert.equal(out.status, 'rejected');
    assert.ok(out.rejection_reasons.length > 0);
  });
});

// ─────────────────────────────────────────────────────────────────
// F-252714-061 — correlation_id pinned across all stages
// ─────────────────────────────────────────────────────────────────

describe('F-252714-061 — correlation_id pinned across every ingest stage', () => {
  it('valid submission: correlation_id == run_id, present on every emitted event', async () => {
    setupTestRoot();

    const { captured } = await captureStderr(() =>
      ingest(pilot0, { repoRoot: TEST_ROOT, provenance: stubProvenance })
    );
    const events = parseStageEvents(captured);
    assert.ok(events.length >= 4, 'at least dispatch+context+verify+persist events');

    for (const e of events) {
      assert.equal(e.correlation_id, pilot0.run_id,
        `event '${e.stage}' missing correlation_id (or wrong value): ${JSON.stringify(e)}`);
    }
  });

  it('invalid submission (null): correlation_id is synthetic ing-<base36>-<rand4>', async () => {
    setupTestRoot();

    const { captured } = await captureStderr(() =>
      ingest(null, { repoRoot: TEST_ROOT, provenance: stubProvenance })
    );
    const events = parseStageEvents(captured);
    assert.ok(events.length > 0);

    const ids = new Set(events.map(e => e.correlation_id));
    assert.equal(ids.size, 1, 'all events in one ingest run share one correlation_id');
    const [id] = ids;
    assert.match(id, /^ing-[0-9a-z]+-[0-9a-f]{4}$/,
      `synthetic correlation_id should match ing-<base36>-<rand4>; got: ${id}`);
  });

  it('two consecutive ingest() calls produce DIFFERENT correlation_ids', async () => {
    setupTestRoot();

    const { captured: cap1 } = await captureStderr(() =>
      ingest(null, { repoRoot: TEST_ROOT, provenance: stubProvenance })
    );
    const { captured: cap2 } = await captureStderr(() =>
      ingest(null, { repoRoot: TEST_ROOT, provenance: stubProvenance })
    );

    const id1 = parseStageEvents(cap1)[0].correlation_id;
    const id2 = parseStageEvents(cap2)[0].correlation_id;
    assert.notEqual(id1, id2,
      'each ingest run gets its own correlation_id (synthetic ids must be unique per run)');
  });

  it('verifyOnly() also pins correlation_id across every stage', async () => {
    setupTestRoot();

    const { captured } = await captureStderr(() =>
      verifyOnly(pilot0, { repoRoot: TEST_ROOT, provenance: stubProvenance })
    );
    const events = parseStageEvents(captured);
    for (const e of events) {
      assert.equal(e.correlation_id, pilot0.run_id,
        `verify-only event '${e.stage}' missing correlation_id: ${JSON.stringify(e)}`);
    }
  });

  it('rejected_pre_persist (duplicate) carries correlation_id', async () => {
    setupTestRoot();

    // First ingest succeeds.
    await ingest(pilot0, { repoRoot: TEST_ROOT, provenance: stubProvenance });

    // Second ingest hits the duplicate-pre-persist branch.
    const { captured } = await captureStderr(() =>
      ingest(pilot0, { repoRoot: TEST_ROOT, provenance: stubProvenance })
    );
    const events = parseStageEvents(captured);
    const dup = events.find(e => e.stage === 'rejected_pre_persist');
    assert.ok(dup, 'rejected_pre_persist must fire on duplicate');
    assert.equal(dup.correlation_id, pilot0.run_id);
    assert.equal(dup.reason, 'duplicate');
  });

  it('rejected_pre_persist (skip_persist on null) carries synthetic correlation_id', async () => {
    setupTestRoot();

    const { captured } = await captureStderr(() =>
      ingest(null, { repoRoot: TEST_ROOT, provenance: stubProvenance })
    );
    const events = parseStageEvents(captured);
    const skip = events.find(e => e.stage === 'rejected_pre_persist');
    assert.ok(skip, 'rejected_pre_persist must fire on null submission');
    assert.equal(skip.reason, 'skip_persist');
    assert.match(skip.correlation_id, /^ing-/,
      'synthetic correlation_id flows through to skip_persist branch');
  });

  it('component pinned to "ingest" on every event regardless of correlation_id', async () => {
    // F-252714-061 must not regress F-827321-034 — component still pinned.
    setupTestRoot();

    const { captured } = await captureStderr(() =>
      ingest(pilot0, { repoRoot: TEST_ROOT, provenance: stubProvenance })
    );
    const events = parseStageEvents(captured);
    for (const e of events) {
      assert.equal(e.component, 'ingest',
        `event '${e.stage}' lost component='ingest': ${JSON.stringify(e)}`);
    }
  });
});
