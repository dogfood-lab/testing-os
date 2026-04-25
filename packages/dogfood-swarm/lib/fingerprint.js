/**
 * fingerprint.js — Stable finding dedup across waves.
 *
 * A fingerprint is: kind + rule_id + normalized_path + symbol + normalized_span
 *
 * This gives us:
 *   new        — first time this fingerprint appears
 *   recurring  — same fingerprint seen in a prior wave
 *   fixed      — fingerprint was in prior wave, not in current
 *   deferred   — coordinator chose to defer this finding
 */

import { createHash } from 'node:crypto';

/**
 * Normalize a file path for fingerprinting.
 * Strips leading ./ and normalizes separators.
 */
function normalizePath(filePath) {
  if (!filePath) return '';
  return filePath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .toLowerCase();
}

/**
 * Normalize a span (line range or single line) to a stable bucket.
 * Lines shift as code is edited, so we bucket to nearest 10-line block.
 * This prevents the same finding from appearing "new" after minor edits nearby.
 */
function normalizeSpan(lineNumber) {
  if (!lineNumber && lineNumber !== 0) return '';
  return String(Math.floor(lineNumber / 10) * 10);
}

/**
 * Compute a stable fingerprint for a finding.
 *
 * @param {object} finding
 * @param {string} finding.category — bug, security, quality, ux, etc.
 * @param {string} [finding.rule_id] — optional rule identifier
 * @param {string} [finding.file] — file path
 * @param {string} [finding.symbol] — function/class/variable name
 * @param {number} [finding.line] — line number
 * @param {string} [finding.description] — fallback for uniqueness
 * @returns {string} — hex fingerprint
 */
export function computeFingerprint(finding) {
  // Always include a description hash — two findings in the same file/line/category
  // with different descriptions are different findings.
  const descHash = createHash('sha256')
    .update(finding.description || '')
    .digest('hex')
    .slice(0, 12);

  const parts = [
    finding.category || 'unknown',
    finding.rule_id || '',
    normalizePath(finding.file),
    (finding.symbol || '').toLowerCase(),
    normalizeSpan(finding.line),
    descHash,
  ];

  const raw = parts.join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

/**
 * Classify findings against prior wave state.
 *
 * @param {Array} currentFindings — findings from the current wave (with fingerprints)
 * @param {Map<string, object>} priorFingerprints — fingerprint → finding from prior waves
 * @returns {{ new: Array, recurring: Array, fixed: Array }}
 */
export function classifyFindings(currentFindings, priorFingerprints) {
  const currentSet = new Set();
  const result = { new: [], recurring: [], fixed: [] };

  for (const finding of currentFindings) {
    const fp = finding.fingerprint || computeFingerprint(finding);
    currentSet.add(fp);

    if (priorFingerprints.has(fp)) {
      result.recurring.push({ ...finding, fingerprint: fp, prior: priorFingerprints.get(fp) });
    } else {
      result.new.push({ ...finding, fingerprint: fp });
    }
  }

  // Findings that were in prior waves but not current = fixed
  for (const [fp, prior] of priorFingerprints) {
    if (!currentSet.has(fp) && prior.status !== 'deferred' && prior.status !== 'rejected') {
      result.fixed.push({ ...prior, fingerprint: fp });
    }
  }

  return result;
}

/**
 * Build a prior fingerprint map from database findings.
 *
 * @param {Database} db
 * @param {string} runId
 * @returns {Map<string, object>}
 */
export function buildPriorMap(db, runId) {
  const rows = db.prepare(
    `SELECT * FROM findings WHERE run_id = ? AND status NOT IN ('rejected')`
  ).all(runId);

  const map = new Map();
  for (const row of rows) {
    map.set(row.fingerprint, row);
  }
  return map;
}

/**
 * Upsert findings into the database with dedup.
 * New findings get inserted, recurring get their last_seen_wave updated.
 *
 * @param {Database} db
 * @param {string} runId
 * @param {number} waveId
 * @param {object} classified — output of classifyFindings
 * @returns {{ inserted: number, updated: number, fixed: number }}
 */
export function upsertFindings(db, runId, waveId, classified) {
  const insertFinding = db.prepare(`
    INSERT INTO findings (run_id, finding_id, fingerprint, severity, category,
      file_path, line_number, symbol, description, recommendation,
      status, first_seen_wave, last_seen_wave)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO finding_events (finding_id, event_type, wave_id, notes)
    VALUES (?, ?, ?, ?)
  `);

  const updateRecurring = db.prepare(`
    UPDATE findings SET status = 'recurring', last_seen_wave = ? WHERE id = ?
  `);

  const updateFixed = db.prepare(`
    UPDATE findings SET status = 'fixed', last_seen_wave = ? WHERE id = ?
  `);

  let inserted = 0, updated = 0, fixed = 0;

  const tx = db.transaction(() => {
    // Insert new findings
    for (const f of classified.new) {
      const fid = `F-${String(Date.now()).slice(-6)}-${String(inserted + 1).padStart(3, '0')}`;
      const result = insertFinding.run(
        runId, fid, f.fingerprint, f.severity, f.category,
        f.file || null, f.line || null, f.symbol || null,
        f.description, f.recommendation || null, waveId, waveId
      );
      insertEvent.run(result.lastInsertRowid, 'reported', waveId, null);
      inserted++;
    }

    // Update recurring findings
    for (const f of classified.recurring) {
      if (f.prior?.id) {
        updateRecurring.run(waveId, f.prior.id);
        insertEvent.run(f.prior.id, 'recurred', waveId, null);
        updated++;
      }
    }

    // Mark fixed findings
    for (const f of classified.fixed) {
      if (f.id) {
        updateFixed.run(waveId, f.id);
        insertEvent.run(f.id, 'fixed', waveId, null);
        fixed++;
      }
    }
  });

  tx();
  return { inserted, updated, fixed };
}
