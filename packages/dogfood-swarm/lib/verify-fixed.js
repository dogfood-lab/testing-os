/**
 * verify-fixed.js — Re-audit findings marked `[fixed]` against the working tree.
 *
 * F-252713-002 (Phase 7 wave 1, FT-BACKEND-002): Class #14 productization.
 * The wave-24 audit caught two wave-1 findings marked `[fixed]` in the
 * control plane that had not actually been amended in the working tree —
 * the agent reported success, the coordinator believed it, the receipt
 * carried the lie forward. This module rebuilds the discipline as code:
 * for every `status='fixed'` row, re-load the file, re-check the original
 * symbol/line bucket, and classify.
 *
 * Classification (4-way; mirrors the wave-8 fingerprint state machine but
 * specialised for the post-claim audit):
 *
 *   verified                  — file exists, the symbol/anchor token is no
 *                               longer at or near the recorded line bucket.
 *                               The fix landed.
 *   regressed                 — file exists, the symbol/anchor reappears
 *                               within the line bucket but at a different
 *                               line than originally recorded. Looks like a
 *                               fix that landed and was later reverted or
 *                               re-introduced near the same span.
 *   claimed-but-still-present — file exists, the symbol/anchor is still at
 *                               the exact recorded line (±2 line tolerance).
 *                               This is the wave-1 pattern: the agent
 *                               claimed `[fixed]`, but the bug never moved.
 *   unverifiable              — the file is gone, or the finding has no
 *                               file_path / no symbol-or-description anchor
 *                               we can grep for. A human has to look.
 *
 * Delta JSON contract (cross-pollinates with FT-OUTPUTS-001's
 * parse-regression-pins.js consumer):
 *
 *   {
 *     schema: 'verify-fixed-delta/v1',
 *     runId, waveNumber, checkedAt,
 *     summary: { total, verified, regressed, claimedButStillPresent, unverifiable },
 *     threshold: N, thresholdExceeded: bool, exitCode,
 *     findings: [
 *       {
 *         finding_id, fingerprint, classification,
 *         file, line, symbol, severity, description, recommendation,
 *         evidence,                  // one-line human-readable why
 *         originalFixedWave          // last_seen_wave at time of [fixed] event
 *       },
 *       ...
 *     ]
 *   }
 *
 * The schema field is intentionally machine-readable — outputs agent's
 * parse-regression-pins.js can pivot on it without sniffing field names.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

/**
 * Tolerance window (lines) around the recorded line where finding the
 * anchor still counts as "exact match". Anything wider counts as drift
 * within the same fingerprint bucket — i.e. `regressed` rather than
 * `claimed-but-still-present`. Two lines is enough to absorb a stray
 * blank-line edit but tight enough that an actual fix moves out of range.
 */
const EXACT_LINE_TOLERANCE = 2;

/**
 * Width of the line-bucket window (lines), matching the fingerprint
 * normalizeSpan() that buckets to the nearest 10 lines. Within this window
 * the bug-class is considered "near where it was"; outside it the bug-class
 * is gone from the recorded location regardless of what's at the file.
 */
const FINGERPRINT_BUCKET = 10;

/**
 * Fetch all findings WHERE run_id=? AND status='fixed', joined with each
 * finding's most recent `fixed` event so we can report when the claim was
 * made (originalFixedWave) — useful when an operator wants to know which
 * wave's amend agent issued the bogus claim.
 */
export function loadFixedFindings(db, runId) {
  return db.prepare(`
    SELECT
      f.id            AS row_id,
      f.finding_id    AS finding_id,
      f.fingerprint   AS fingerprint,
      f.severity      AS severity,
      f.category      AS category,
      f.file_path     AS file_path,
      f.line_number   AS line_number,
      f.symbol        AS symbol,
      f.description   AS description,
      f.recommendation AS recommendation,
      f.last_seen_wave AS last_seen_wave,
      (SELECT MAX(e.wave_id) FROM finding_events e
        WHERE e.finding_id = f.id AND e.event_type = 'fixed') AS fixed_wave_id
    FROM findings f
    WHERE f.run_id = ? AND f.status = 'fixed'
    ORDER BY f.id ASC
  `).all(runId);
}

/**
 * Resolve a finding's file_path against the run's checkout root.
 *
 * The path is whatever the audit agent wrote into the finding — usually
 * a repo-relative POSIX path (e.g. `packages/dogfood-swarm/cli.js`). If
 * the agent happened to record an absolute path we honour it; otherwise
 * we join against `repoRoot`. We never silently convert an absolute path
 * to relative.
 */
function resolveFilePath(repoRoot, filePath) {
  if (!filePath) return null;
  return isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
}

/**
 * Build a regex that matches the anchor we expect to find at the
 * recorded location. Preference order:
 *   1. symbol  — the function/class/variable name the audit captured.
 *   2. a stable token from the description (first identifier-like word).
 *
 * If neither produces a usable anchor, we return null and the finding
 * classifies as `unverifiable`.
 *
 * Why prefer symbol: it survives prose rewordings the way fingerprint.js
 * already trusts. Description tokens are a fallback for findings that
 * never recorded a symbol (legacy waves; security findings without an
 * obvious named target).
 */
function buildAnchorRegex(finding) {
  const symbol = (finding.symbol || '').trim();
  if (symbol && /^[A-Za-z_][\w$]*$/.test(symbol)) {
    return new RegExp(`\\b${escapeRegex(symbol)}\\b`);
  }

  // Description fallback — first identifier-like word with at least 4
  // characters. Skips obvious filler ("the", "is", "fix", etc.) so we
  // don't anchor on noise.
  const desc = String(finding.description || '');
  const match = desc.match(/\b([A-Za-z_][\w$]{3,})\b/);
  if (match) {
    return new RegExp(`\\b${escapeRegex(match[1])}\\b`);
  }

  return null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Read the file at `absolutePath` and return its split lines, or null if
 * the file is unreadable. We tolerate I/O errors (binary files, permission
 * denied, race-condition deletes) the same way `existsSync === false`
 * tolerates a missing file: classify the finding as `unverifiable`.
 */
function readLines(absolutePath) {
  if (!absolutePath || !existsSync(absolutePath)) return null;
  try {
    return readFileSync(absolutePath, 'utf-8').split(/\r?\n/);
  } catch {
    return null;
  }
}

/**
 * Classify a single finding. Pure function over the finding row + a
 * file-reader injection so tests can substitute a virtual filesystem.
 *
 * @param {object} finding   — row from loadFixedFindings()
 * @param {string} repoRoot  — absolute path of the repo working tree
 * @param {object} [opts]
 * @param {(absPath: string) => string[] | null} [opts.readLines] —
 *   override the file reader (test injection). Default uses node:fs.
 */
export function classifyFixedFinding(finding, repoRoot, opts = {}) {
  const readLinesFn = opts.readLines || readLines;

  const absPath = resolveFilePath(repoRoot, finding.file_path);
  const lines = absPath ? readLinesFn(absPath) : null;

  // Unverifiable: file gone, file unreadable, or no file path on the row.
  if (!finding.file_path) {
    return {
      classification: 'unverifiable',
      evidence: 'finding has no file_path; cannot re-audit without a target file',
    };
  }
  if (lines === null) {
    return {
      classification: 'unverifiable',
      evidence: `file not present at ${finding.file_path} (deleted, moved, or unreadable)`,
    };
  }

  const anchor = buildAnchorRegex(finding);
  if (!anchor) {
    return {
      classification: 'unverifiable',
      evidence: 'finding has no symbol and no identifier-like token in its description; nothing to anchor on',
    };
  }

  const recordedLine = Number(finding.line_number) || 0;

  // Bucket window — matches the fingerprint normalizeSpan() granularity.
  // We scan the bucket the recorded line falls into PLUS one line of
  // overlap on each side so a finding recorded at line 19 doesn't miss
  // anchors that landed at line 21 (different fingerprint bucket but
  // operationally adjacent).
  let bucketStart, bucketEnd;
  if (recordedLine > 0) {
    const bucket = Math.floor(recordedLine / FINGERPRINT_BUCKET) * FINGERPRINT_BUCKET;
    bucketStart = Math.max(1, bucket);
    bucketEnd = bucket + FINGERPRINT_BUCKET;
  } else {
    // No line recorded: scan the whole file. If anchor exists anywhere,
    // we report claimed-but-still-present (best we can do without span).
    bucketStart = 1;
    bucketEnd = lines.length;
  }

  // Search for the anchor inside the bucket window. Note that the line
  // array is 0-indexed but recorded line numbers are 1-indexed.
  let matchedLine = null;
  for (let lineNo = bucketStart; lineNo <= Math.min(bucketEnd, lines.length); lineNo++) {
    const text = lines[lineNo - 1];
    if (typeof text === 'string' && anchor.test(text)) {
      matchedLine = lineNo;
      break;
    }
  }

  if (matchedLine === null) {
    return {
      classification: 'verified',
      evidence: `anchor /${anchor.source}/ no longer present at ${finding.file_path}:${bucketStart}-${bucketEnd}`,
    };
  }

  // Anchor is still in the bucket — distinguish exact-line (claim never
  // landed) from drift-within-bucket (regressed near original).
  if (recordedLine > 0 && Math.abs(matchedLine - recordedLine) <= EXACT_LINE_TOLERANCE) {
    return {
      classification: 'claimed-but-still-present',
      evidence: `anchor /${anchor.source}/ still at ${finding.file_path}:${matchedLine} (recorded line ${recordedLine}); fix never landed`,
    };
  }

  return {
    classification: 'regressed',
    evidence: `anchor /${anchor.source}/ reappeared at ${finding.file_path}:${matchedLine} (recorded line ${recordedLine || 'unspecified'}); looks reverted within the same bucket`,
  };
}

/**
 * Build the renderer-agnostic delta model for a run.
 *
 * Test-injectable via `opts.readLines`. The CLI binds this to the real
 * filesystem; tests bind it to a Map<absPath, string[]> shim.
 */
export function buildVerifyFixedDelta({
  runId,
  waveNumber,
  fixedFindings,
  repoRoot,
  threshold = 0,
  readLines: readLinesOverride,
  now = () => new Date().toISOString(),
}) {
  const findings = [];
  const summary = {
    total: fixedFindings.length,
    verified: 0,
    regressed: 0,
    claimedButStillPresent: 0,
    unverifiable: 0,
  };

  for (const f of fixedFindings) {
    const { classification, evidence } = classifyFixedFinding(f, repoRoot, { readLines: readLinesOverride });
    findings.push({
      finding_id: f.finding_id,
      fingerprint: f.fingerprint,
      classification,
      file: f.file_path || null,
      line: f.line_number ?? null,
      symbol: f.symbol || null,
      severity: f.severity,
      category: f.category,
      description: f.description,
      recommendation: f.recommendation || null,
      evidence,
      originalFixedWave: f.fixed_wave_id ?? f.last_seen_wave ?? null,
    });

    if (classification === 'verified') summary.verified += 1;
    else if (classification === 'regressed') summary.regressed += 1;
    else if (classification === 'claimed-but-still-present') summary.claimedButStillPresent += 1;
    else if (classification === 'unverifiable') summary.unverifiable += 1;
  }

  const offending = summary.regressed + summary.claimedButStillPresent;
  const thresholdExceeded = offending > threshold;

  // Exit code (matches wave-18 3-way digest disambiguation):
  //   0 — no fixed findings to check OR every fixed finding verified clean
  //       AND offending count within threshold.
  //   1 — offending count exceeds threshold (regressed +
  //       claimed-but-still-present): the actionable failure case.
  //   2 — pipeline broken: ALL findings classified `unverifiable` while
  //       there ARE findings — every claim is unauditable; the operator
  //       cannot conclude clean OR dirty without human review. This is
  //       the analogue of findings-digest.js's pipeline_broken status.
  let exitCode;
  if (summary.total === 0) {
    exitCode = 0;
  } else if (summary.unverifiable === summary.total) {
    exitCode = 2;
  } else if (thresholdExceeded) {
    exitCode = 1;
  } else {
    exitCode = 0;
  }

  return {
    schema: 'verify-fixed-delta/v1',
    runId,
    waveNumber,
    checkedAt: now(),
    summary,
    threshold,
    thresholdExceeded,
    exitCode,
    findings,
  };
}
