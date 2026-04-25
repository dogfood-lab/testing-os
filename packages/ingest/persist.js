/**
 * Persist layer
 *
 * Writes verified records to the canonical sharded path.
 * Handles: accepted/rejected routing, atomic write (temp+rename),
 * duplicate detection by run_id, directory creation.
 */

import { existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Compute the canonical file path for a persisted record.
 *
 * Accepted:  records/<org>/<repo>/YYYY/MM/DD/run-<run_id>.json
 * Rejected:  records/_rejected/<org>/<repo>/YYYY/MM/DD/run-<run_id>.json
 *
 * @param {object} record - Persisted record
 * @param {string} repoRoot - Absolute path to dogfood-labs repo root
 * @returns {string} Absolute file path
 */
export function computeRecordPath(record, repoRoot) {
  const status = record.verification?.status;
  const base = status === 'rejected' ? 'records/_rejected' : 'records';

  const [org, repo] = (record.repo || '').split('/');
  if (!org || !repo) {
    throw new Error(`invalid repo format: ${record.repo}`);
  }

  const unsafeSegment = /[.\\/]/;
  if (unsafeSegment.test(org) || unsafeSegment.test(repo)) {
    throw new Error(`unsafe repo segment: ${record.repo}`);
  }

  if (!/^[\w-]+$/.test(record.run_id)) {
    throw new Error(`unsafe run_id: ${record.run_id}`);
  }

  const finishedAt = record.timing?.finished_at;
  if (!finishedAt) {
    throw new Error('record missing timing.finished_at');
  }

  const date = new Date(finishedAt);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid finished_at timestamp');
  }
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  const filename = `run-${record.run_id}.json`;

  return join(repoRoot, base, org, repo, year, month, day, filename);
}

/**
 * Check if a record with this run_id already exists (accepted or rejected).
 *
 * @param {string} runId
 * @param {object} record - The record (used for repo/timing to compute path)
 * @param {string} repoRoot
 * @returns {boolean}
 */
export function isDuplicate(runId, record, repoRoot) {
  // Check accepted path
  const acceptedRecord = { ...record, verification: { ...record.verification, status: 'accepted' } };
  const acceptedPath = computeRecordPath(acceptedRecord, repoRoot);
  if (existsSync(acceptedPath)) return true;

  // Check rejected path
  const rejectedRecord = { ...record, verification: { ...record.verification, status: 'rejected' } };
  const rejectedPath = computeRecordPath(rejectedRecord, repoRoot);
  if (existsSync(rejectedPath)) return true;

  return false;
}

/**
 * Write a record atomically: write to temp file, then rename.
 *
 * @param {object} record - Persisted record
 * @param {string} repoRoot - Absolute path to dogfood-labs repo root
 * @returns {{ path: string, written: boolean }} path and whether a write occurred
 */
export function writeRecord(record, repoRoot) {
  if (isDuplicate(record.run_id, record, repoRoot)) {
    const path = computeRecordPath(record, repoRoot);
    return { path, written: false };
  }

  const path = computeRecordPath(record, repoRoot);
  const dir = dirname(path);

  mkdirSync(dir, { recursive: true });

  // Atomic write: temp file → rename
  const tmpSuffix = randomBytes(4).toString('hex');
  const tmpPath = `${path}.${tmpSuffix}.tmp`;

  writeFileSync(tmpPath, JSON.stringify(record, null, 2) + '\n', 'utf-8');
  renameSync(tmpPath, path);

  return { path, written: true };
}
