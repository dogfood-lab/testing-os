/**
 * verify.test.js — Phase 2 tests: adapter registry, probing, verification runner.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// ── Adapters ──
import { nodeAdapter } from './lib/verify/adapters/node.js';
import { pythonAdapter } from './lib/verify/adapters/python.js';
import { rustAdapter } from './lib/verify/adapters/rust.js';

// ── Registry ──
import { probeAll, selectAdapter, listAdapters } from './lib/verify/registry.js';

// ── Runner ──
import { runStep } from './lib/verify/runner.js';

// ── Control plane integration ──
import { openMemoryDb } from './db/connection.js';
import { saveDomainDraft, freezeDomains } from './lib/domains.js';

// ═══════════════════════════════════════════
// Runner
// ═══════════════════════════════════════════

describe('Runner — runStep', () => {
  it('captures passing command', () => {
    const result = runStep('.', { name: 'echo', cmd: 'node', args: ['-e', '"process.exit(0)"'] });
    assert.equal(result.passed, true);
    assert.equal(result.exit_code, 0);
    assert.ok(result.duration_ms >= 0);
    assert.equal(result.name, 'echo');
  });

  it('captures failing command', () => {
    const result = runStep('.', { name: 'fail', cmd: 'node', args: ['-e', '"process.exit(1)"'] });
    assert.equal(result.passed, false);
    assert.equal(result.exit_code, 1);
  });

  it('captures stdout', () => {
    const result = runStep('.', { name: 'out', cmd: 'node', args: ['-e', '"console.log(42)"'] });
    assert.ok(result.stdout.includes('42'));
  });

  it('marks optional flag', () => {
    const result = runStep('.', { name: 'opt', cmd: 'node', args: ['-e', '"process.exit(1)"'], optional: true });
    assert.equal(result.passed, false);
    assert.equal(result.optional, true);
  });
});

// ═══════════════════════════════════════════
// Node adapter probing
// ═══════════════════════════════════════════

describe('Node adapter — probe', () => {
  it('scores high for stillpoint (has package.json + tsconfig)', () => {
    const stillpoint = 'F:/AI/stillpoint';
    if (!existsSync(join(stillpoint, 'package.json'))) return; // skip if not available
    const result = nodeAdapter.probe(stillpoint);
    assert.ok(result.score >= 50, `Expected score >= 50, got ${result.score}`);
    assert.ok(result.evidence.packageJson);
    assert.ok(result.reason.includes('Node'));
  });

  it('scores zero for non-node repo', () => {
    const result = nodeAdapter.probe('/tmp');
    assert.equal(result.score, 0);
  });
});

describe('Python adapter — probe', () => {
  it('scores high for ai-eyes-mcp (has pyproject.toml)', () => {
    const aiEyes = 'F:/AI/ai-eyes-mcp';
    if (!existsSync(join(aiEyes, 'pyproject.toml'))) return;
    const result = pythonAdapter.probe(aiEyes);
    assert.ok(result.score >= 50, `Expected score >= 50, got ${result.score}`);
    assert.ok(result.evidence.pyprojectToml);
  });

  it('scores zero for non-python repo', () => {
    const result = pythonAdapter.probe('/tmp');
    assert.equal(result.score, 0);
  });
});

describe('Rust adapter — probe', () => {
  it('scores high for saints-mile (has Cargo.toml)', () => {
    const saints = 'F:/AI/saints-mile';
    if (!existsSync(join(saints, 'Cargo.toml'))) return;
    const result = rustAdapter.probe(saints);
    assert.ok(result.score >= 60, `Expected score >= 60, got ${result.score}`);
    assert.ok(result.evidence.cargoToml);
  });

  it('scores zero for non-rust repo', () => {
    const result = rustAdapter.probe('/tmp');
    assert.equal(result.score, 0);
  });
});

// ═══════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════

describe('Registry — probeAll', () => {
  it('returns sorted results for stillpoint', () => {
    const stillpoint = 'F:/AI/stillpoint';
    if (!existsSync(join(stillpoint, 'package.json'))) return;
    const results = probeAll(stillpoint);
    assert.ok(results.length >= 3);
    // Node should be first (highest score)
    assert.equal(results[0].name, 'node');
    assert.ok(results[0].score > 0);
    // Results are sorted descending
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score);
    }
  });

  it('returns sorted results for ai-eyes-mcp', () => {
    const aiEyes = 'F:/AI/ai-eyes-mcp';
    if (!existsSync(join(aiEyes, 'pyproject.toml'))) return;
    const results = probeAll(aiEyes);
    assert.equal(results[0].name, 'python');
    assert.ok(results[0].score > 0);
  });
});

describe('Registry — selectAdapter', () => {
  it('selects node for stillpoint', () => {
    const stillpoint = 'F:/AI/stillpoint';
    if (!existsSync(join(stillpoint, 'package.json'))) return;
    const selection = selectAdapter(stillpoint);
    assert.equal(selection.name, 'node');
  });

  it('selects python for ai-eyes-mcp', () => {
    const aiEyes = 'F:/AI/ai-eyes-mcp';
    if (!existsSync(join(aiEyes, 'pyproject.toml'))) return;
    const selection = selectAdapter(aiEyes);
    assert.equal(selection.name, 'python');
  });

  it('respects explicit override', () => {
    const stillpoint = 'F:/AI/stillpoint';
    if (!existsSync(join(stillpoint, 'package.json'))) return;
    const selection = selectAdapter(stillpoint, 'python');
    assert.equal(selection.name, 'python');
  });

  it('throws on unknown adapter override', () => {
    assert.throws(() => selectAdapter('.', 'cobol'), /Unknown adapter/);
  });

  it('returns null for unrecognized repo', () => {
    const selection = selectAdapter('/tmp');
    assert.equal(selection, null);
  });
});

describe('Registry — listAdapters', () => {
  it('lists all three adapters', () => {
    const adapters = listAdapters();
    assert.ok(adapters.includes('node'));
    assert.ok(adapters.includes('python'));
    assert.ok(adapters.includes('rust'));
  });
});

// ═══════════════════════════════════════════
// Control plane integration
// ═══════════════════════════════════════════

describe('Verification receipt persistence', () => {
  let db;

  beforeEach(() => {
    db = openMemoryDb();
    db.prepare('INSERT INTO runs (id, repo, local_path, commit_sha) VALUES (?, ?, ?, ?)')
      .run('r1', 'org/r', '/tmp/r', 'a'.repeat(40));
    saveDomainDraft(db, 'r1', [{ name: 'backend', globs: ['src/**'], ownership_class: 'owned' }]);
    freezeDomains(db, 'r1');
    db.prepare("INSERT INTO waves (run_id, phase, wave_number, status) VALUES ('r1', 'health-audit-a', 1, 'collected')")
      .run();
  });

  it('inserts verification receipt into DB', () => {
    db.prepare(`
      INSERT INTO verification_receipts (wave_id, repo_type, commands_run, exit_code, passed, test_count)
      VALUES (1, 'node', '["npm test"]', 0, 1, 42)
    `).run();

    const receipt = db.prepare('SELECT * FROM verification_receipts WHERE wave_id = 1').get();
    assert.ok(receipt);
    assert.equal(receipt.repo_type, 'node');
    assert.equal(receipt.passed, 1);
    assert.equal(receipt.test_count, 42);
    db.close();
  });

  it('verification pass updates wave to verified', () => {
    // Simulate what verify command does
    db.prepare(`
      INSERT INTO verification_receipts (wave_id, repo_type, commands_run, exit_code, passed, test_count)
      VALUES (1, 'node', '["npm test"]', 0, 1, 42)
    `).run();
    db.prepare("UPDATE waves SET status = 'verified' WHERE id = 1 AND status = 'collected'").run();

    const wave = db.prepare('SELECT status FROM waves WHERE id = 1').get();
    assert.equal(wave.status, 'verified');
    db.close();
  });

  it('verification fail does NOT update wave to verified', () => {
    db.prepare(`
      INSERT INTO verification_receipts (wave_id, repo_type, commands_run, exit_code, passed, test_count)
      VALUES (1, 'node', '["npm test"]', 1, 0, 0)
    `).run();
    // Do NOT update wave status

    const wave = db.prepare('SELECT status FROM waves WHERE id = 1').get();
    assert.equal(wave.status, 'collected'); // unchanged
    db.close();
  });
});

// ═══════════════════════════════════════════
// Node adapter — commands shape
// ═══════════════════════════════════════════

describe('Node adapter — commands', () => {
  it('produces correct default steps', () => {
    const steps = nodeAdapter.commands();
    assert.ok(steps.length >= 3);

    const names = steps.map(s => s.name);
    assert.ok(names.includes('lint'));
    assert.ok(names.includes('typecheck'));
    assert.ok(names.includes('test'));
  });

  it('allows command overrides', () => {
    const steps = nodeAdapter.commands({
      test: { name: 'test', cmd: 'vitest', args: ['run'] },
    });
    const testStep = steps.find(s => s.name === 'test');
    assert.equal(testStep.cmd, 'vitest');
  });
});

describe('Python adapter — commands', () => {
  it('produces correct default steps', () => {
    const steps = pythonAdapter.commands();
    const names = steps.map(s => s.name);
    assert.ok(names.includes('lint'));
    assert.ok(names.includes('test'));
  });
});

describe('Rust adapter — commands', () => {
  it('produces correct default steps', () => {
    const steps = rustAdapter.commands();
    const names = steps.map(s => s.name);
    assert.ok(names.includes('check'));
    assert.ok(names.includes('test'));
  });
});
