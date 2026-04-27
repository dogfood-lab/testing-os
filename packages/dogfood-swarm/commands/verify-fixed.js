/**
 * verify-fixed.js — `swarm verify-fixed <run-id> [--threshold=N] [--format=...]`
 *
 * F-252713-002 (Phase 7 wave 1, FT-BACKEND-002): the on-demand command
 * companion to FT-OUTPUTS-001's always-on CI gate. Together they
 * operationalize Class #14 — the wave-1 "claimed-fixed without
 * verification" pattern — with a runtime check (this command) and a
 * commit-time check (the parse-regression-pins.js harness). Surface for
 * an operator at the keyboard who wants to ask, right now, "did those
 * fixes actually land?"
 *
 * The command:
 *   1. Loads every finding WHERE run_id=? AND status='fixed'.
 *   2. For each, re-loads the file at f.file_path from disk and
 *      classifies into verified / regressed / claimed-but-still-present
 *      / unverifiable (see lib/verify-fixed.js for the contract).
 *   3. Writes the delta JSON to swarms/<run>/verify-fixed-<wave>.json —
 *      this is the producer half of the contract that
 *      packages/portfolio/lib/parse-regression-pins.js consumes.
 *   4. Emits a TTY-aware summary via lib/findings-render.js's
 *      renderVerifyFixedDelta() choke-point. There is no
 *      `console.log(rawMarkdown)` path here — Class #9 sweep invariant.
 *   5. Exits 0/1/2 per the wave-18 3-way disambiguation contract:
 *      0 = clean (no fixed findings OR everything verified within
 *          threshold), 1 = threshold exceeded (actionable failure),
 *          2 = pipeline broken (every claim unverifiable).
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { openDb } from '../db/connection.js';
import { loadFixedFindings, buildVerifyFixedDelta } from '../lib/verify-fixed.js';
import { renderVerifyFixedDelta } from '../lib/findings-render.js';
import { logStage } from '../lib/log-stage.js';

/**
 * Run the verify-fixed audit.
 *
 * @param {object} opts
 * @param {string} opts.runId
 * @param {string} opts.dbPath
 * @param {string} opts.outputDir — root swarms/<run> directory; the delta
 *   JSON is written to swarms/<run>/verify-fixed-<wave>.json.
 * @param {number} [opts.threshold=0]
 * @param {string} [opts.format] — text|markdown|json (auto-detect if
 *   omitted)
 * @param {NodeJS.WriteStream} [opts.stream=process.stdout]
 * @returns {{ delta: object, output: string, deltaPath: string, exitCode: 0|1|2 }}
 */
export function verifyFixed(opts) {
  const db = openDb(opts.dbPath);

  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(opts.runId);
  if (!run) {
    throw new Error(`Run not found: ${opts.runId}`);
  }

  // Pin the wave number to the latest wave for filename + reporting. We
  // do not require a wave to exist — a run with zero waves still has zero
  // fixed findings, and exit code 0 is the right answer.
  const latestWave = db.prepare(
    'SELECT wave_number FROM waves WHERE run_id = ? ORDER BY wave_number DESC LIMIT 1'
  ).get(opts.runId);
  const waveNumber = latestWave?.wave_number ?? null;

  const fixed = loadFixedFindings(db, opts.runId);

  logStage('verify_fixed_start', {
    component: 'dogfood-swarm',
    runId: opts.runId,
    wave: waveNumber,
    fixed_count: fixed.length,
    threshold: opts.threshold ?? 0,
  });

  const delta = buildVerifyFixedDelta({
    runId: opts.runId,
    waveNumber,
    fixedFindings: fixed,
    repoRoot: run.local_path,
    threshold: opts.threshold ?? 0,
  });

  // Persist the delta JSON inside the run's swarms directory, alongside
  // wave artifacts. Filename uses the wave number when known, otherwise
  // `verify-fixed.json` so the contract still has a stable path.
  const deltaName = waveNumber != null ? `verify-fixed-${waveNumber}.json` : 'verify-fixed.json';
  const deltaPath = join(opts.outputDir, deltaName);
  if (!existsSync(dirname(deltaPath))) {
    mkdirSync(dirname(deltaPath), { recursive: true });
  }
  writeFileSync(deltaPath, JSON.stringify(delta, null, 2) + '\n', 'utf-8');

  const output = renderVerifyFixedDelta(delta, opts.format, opts.stream || process.stdout);

  logStage('verify_fixed_complete', {
    component: 'dogfood-swarm',
    runId: opts.runId,
    wave: waveNumber,
    summary: delta.summary,
    threshold: delta.threshold,
    threshold_exceeded: delta.thresholdExceeded,
    delta_path: deltaPath,
    exit_code: delta.exitCode,
  });

  return {
    delta,
    output,
    deltaPath,
    exitCode: delta.exitCode,
  };
}
