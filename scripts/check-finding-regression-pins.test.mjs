/**
 * Regression tests for scripts/check-finding-regression-pins.mjs.
 *
 * Why this lives at the root scripts/ tree: same reason as sync-version.test.mjs
 * and check-doc-drift.test.mjs — the gate isn't owned by any workspace package
 * and we don't want to grow a pseudo-workspace just to host it. Run via
 * `npm run test:scripts`.
 *
 * Coverage:
 *   1. Clean tree — no orphans → ok=true, exit 0 path
 *   2. Drift tree — synthetic source F-id with no test pin → ok=false
 *   3. Allowlist — orphan covered by allowlist → ok=true, allowlistApplied non-empty
 *   4. Unused allowlist entry — surfaced in unusedAllowEntries (not a hard failure)
 *   5. --write-index flag — writes a JSON file at the requested path
 *   6. Allowlist loader — malformed JSON, missing "allow", non-string reason all error
 *   7. Live-tree assertion: the actual repo passes the gate (load-bearing test —
 *      this is the contract that says "the gate is wired and current")
 *
 * Cleanup: every makeFixture() registers `t.after(() => rmSync(dir, ...))`
 * mirroring the check-doc-drift pattern that closed F-651020-007.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runRegressionPinGate,
  loadAllowlist,
  applyAllowlist,
  formatHuman,
} from './check-finding-regression-pins.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/**
 * Allocate a temp fixture root, register cleanup, return helpers.
 */
function makeFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'check-regression-pins-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return {
    dir,
    write(rel, content) {
      const abs = join(dir, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    },
    writeAllowlist(obj) {
      const abs = join(dir, 'allowlist.json');
      writeFileSync(abs, JSON.stringify(obj, null, 2));
      return abs;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Positive cases — clean tree, allowlist coverage
// ─────────────────────────────────────────────────────────────────────────────

test('clean tree: every source pin has a matching test pin → ok=true', async (t) => {
  const fx = makeFixture(t);
  fx.write('packages/foo/index.js', '// F-100000-001 — defensive guard\n');
  fx.write('packages/foo/index.test.js', "describe('guard (F-100000-001)', () => {});\n");

  const result = await runRegressionPinGate({ repoRoot: fx.dir, allowlistPath: fx.writeAllowlist({ allow: {} }) });

  assert.equal(result.ok, true, `expected ok=true on clean tree; orphans=${JSON.stringify(result.orphans)}`);
  assert.equal(result.orphans.length, 0);
  assert.equal(result.json.summary.source_ids, 1);
  assert.equal(result.json.summary.test_ids, 1);
});

test('orphan covered by allowlist → ok=true, allowlistApplied includes the id', async (t) => {
  const fx = makeFixture(t);
  fx.write('packages/foo/index.js', '// F-200000-001 — cross-ref to sibling fix elsewhere\n');
  // No test pin for F-200000-001.
  const allowlistPath = fx.writeAllowlist({
    allow: {
      'F-200000-001': { reason: 'cross-reference to sibling fix; pin lives in another file', file: 'packages/foo/index.js' },
    },
  });

  const result = await runRegressionPinGate({ repoRoot: fx.dir, allowlistPath });

  assert.equal(result.ok, true);
  assert.deepEqual(result.allowlistApplied, ['F-200000-001']);
  assert.deepEqual(result.orphans, []);
});

test('unused allowlist entry surfaces as warning but does not fail the gate', async (t) => {
  const fx = makeFixture(t);
  fx.write('packages/foo/index.js', '// F-100000-001\n');
  fx.write('packages/foo/index.test.js', '// F-100000-001\n');
  const allowlistPath = fx.writeAllowlist({
    allow: {
      'F-999999-999': { reason: 'never resolved' },
    },
  });

  const result = await runRegressionPinGate({ repoRoot: fx.dir, allowlistPath });

  assert.equal(result.ok, true, 'unused allowlist entries are advisory, not failure');
  assert.deepEqual(result.unusedAllowEntries, ['F-999999-999']);
});

// ─────────────────────────────────────────────────────────────────────────────
// Negative cases — orphan source pin
// ─────────────────────────────────────────────────────────────────────────────

test('synthetic source F-id with no matching test pin → ok=false, orphans listed', async (t) => {
  const fx = makeFixture(t);
  fx.write('packages/foo/index.js', '// F-300000-001 — fix that nobody tested\n');
  // Deliberately no test file pinning F-300000-001.

  const result = await runRegressionPinGate({ repoRoot: fx.dir, allowlistPath: fx.writeAllowlist({ allow: {} }) });

  assert.equal(result.ok, false, 'orphan source pin should fail the gate');
  assert.deepEqual(result.orphans, ['F-300000-001']);
  assert.equal(result.allowlistApplied.length, 0);
});

test('orphan from one file does not mask a clean orphan elsewhere', async (t) => {
  const fx = makeFixture(t);
  fx.write('packages/a/x.js', '// F-400000-001 — orphan a\n');
  fx.write('packages/b/y.js', '// F-400000-002 — orphan b\n');
  fx.write('packages/c/z.js', '// F-400000-003 — has test\n');
  fx.write('packages/c/z.test.js', '// F-400000-003 — regression\n');

  const result = await runRegressionPinGate({ repoRoot: fx.dir, allowlistPath: fx.writeAllowlist({ allow: {} }) });

  assert.equal(result.ok, false);
  assert.deepEqual([...result.orphans].sort(), ['F-400000-001', 'F-400000-002']);
});

// ─────────────────────────────────────────────────────────────────────────────
// --write-index flag
// ─────────────────────────────────────────────────────────────────────────────

test('--write-index path: writes JSON to the requested path with parser shape', async (t) => {
  const fx = makeFixture(t);
  fx.write('packages/foo/index.js', '// F-500000-001\n');
  fx.write('packages/foo/index.test.js', '// F-500000-001\n');
  const indexPath = 'docs/regression-pin-index.json';

  const result = await runRegressionPinGate({
    repoRoot: fx.dir,
    allowlistPath: fx.writeAllowlist({ allow: {} }),
    writeIndexPath: indexPath,
  });

  assert.equal(result.ok, true);
  assert.ok(result.indexWritten, 'indexWritten should be set when --write-index is used');
  assert.ok(existsSync(result.indexWritten), `index file should exist at ${result.indexWritten}`);

  const contents = JSON.parse(readFileSync(result.indexWritten, 'utf-8'));
  assert.ok(contents.source_pins['F-500000-001']);
  assert.ok(contents.test_pins['F-500000-001']);
  assert.equal(contents.summary.source_ids, 1);
  assert.equal(contents.summary.test_ids, 1);
  assert.deepEqual(contents.summary.orphan_source_ids, []);
});

test('without --write-index: no index file is written and indexWritten is null', async (t) => {
  const fx = makeFixture(t);
  fx.write('packages/foo/index.js', '// F-600000-001\n');
  fx.write('packages/foo/index.test.js', '// F-600000-001\n');

  const result = await runRegressionPinGate({ repoRoot: fx.dir, allowlistPath: fx.writeAllowlist({ allow: {} }) });

  assert.equal(result.indexWritten, null, '--write-index is opt-in; default must NOT write a file');
});

// ─────────────────────────────────────────────────────────────────────────────
// loadAllowlist / applyAllowlist — defensive contract
// ─────────────────────────────────────────────────────────────────────────────

test('loadAllowlist: missing file returns empty allow', () => {
  const empty = loadAllowlist(join(tmpdir(), `does-not-exist-${Date.now()}.json`));
  assert.deepEqual(empty, { allow: {} });
});

test('loadAllowlist: malformed JSON throws a helpful error', (t) => {
  const fx = makeFixture(t);
  fx.write('bad.json', '{ not valid json');
  assert.throws(
    () => loadAllowlist(join(fx.dir, 'bad.json')),
    /not valid JSON/,
  );
});

test('loadAllowlist: missing "allow" field throws', (t) => {
  const fx = makeFixture(t);
  fx.write('no-allow.json', JSON.stringify({ description: 'I forgot the allow key' }));
  assert.throws(
    () => loadAllowlist(join(fx.dir, 'no-allow.json')),
    /missing required "allow" field/,
  );
});

test('loadAllowlist: entry without reason throws', (t) => {
  const fx = makeFixture(t);
  fx.write('no-reason.json', JSON.stringify({ allow: { 'F-100000-001': {} } }));
  assert.throws(
    () => loadAllowlist(join(fx.dir, 'no-reason.json')),
    /missing "reason"/,
  );
});

test('applyAllowlist: pure function over a parsed json shape', () => {
  const json = {
    source_pins: { 'F-100000-001': ['/x/a.js'], 'F-200000-002': ['/x/b.js'] },
    test_pins: {},
    files_scanned: 2,
    summary: {
      source_ids: 2,
      test_ids: 0,
      orphan_source_ids: ['F-100000-001', 'F-200000-002'],
    },
  };
  const allowlist = { allow: { 'F-100000-001': { reason: 'ok' } } };
  const out = applyAllowlist(json, allowlist);
  assert.deepEqual(out.orphansAfterAllowlist, ['F-200000-002']);
  assert.deepEqual(out.applied, ['F-100000-001']);
  assert.deepEqual(out.unusedAllowEntries, []);
});

// ─────────────────────────────────────────────────────────────────────────────
// formatHuman — sanity-check the user-facing output
// ─────────────────────────────────────────────────────────────────────────────

test('formatHuman: includes orphan list when there are orphans', () => {
  const result = {
    ok: false,
    json: {
      source_pins: { 'F-700000-001': ['/repo/packages/foo/index.js'] },
      test_pins: {},
      files_scanned: 1,
      summary: { source_ids: 1, test_ids: 0, orphan_source_ids: ['F-700000-001'] },
    },
    orphans: ['F-700000-001'],
    allowlistApplied: [],
    unusedAllowEntries: [],
    indexWritten: null,
  };
  const text = formatHuman(result, '/repo');
  assert.match(text, /FAIL/);
  assert.match(text, /F-700000-001/);
  assert.match(text, /How to fix/);
});

test('formatHuman: marks the live tree as OK when there are no orphans', () => {
  const result = {
    ok: true,
    json: { source_pins: {}, test_pins: {}, files_scanned: 0, summary: { source_ids: 0, test_ids: 0, orphan_source_ids: [] } },
    orphans: [],
    allowlistApplied: [],
    unusedAllowEntries: [],
    indexWritten: null,
  };
  const text = formatHuman(result, '/repo');
  assert.match(text, /OK/);
  assert.match(text, /Class #14 invariant holds/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Live-tree assertion — the load-bearing test
// ─────────────────────────────────────────────────────────────────────────────

test('live testing-os tree passes the regression-pin gate', async () => {
  const result = await runRegressionPinGate({ repoRoot });
  if (!result.ok) {
    const detail = result.orphans
      .map((id) => {
        const files = result.json.source_pins[id] ?? [];
        return `  ${id}\n    ${files.join('\n    ')}`;
      })
      .join('\n');
    assert.fail(
      `regression-pin gate FAIL on live tree: ${result.orphans.length} orphan(s):\n${detail}\n\nFix: add a test pin (preferred) OR add an allowlist entry in scripts/regression-pin-allowlist.json with a reason.`,
    );
  }
  assert.equal(result.ok, true);
});
