/**
 * Index generator
 *
 * Scans records/ and records/_rejected/ to produce:
 * - indexes/latest-by-repo.json  (keyed by repo + product_surface)
 * - indexes/failing.json         (records where verified verdict is not pass)
 * - indexes/stale.json           (repos/surfaces with no recent accepted record)
 *
 * Regenerated on every accepted/rejected write in Phase 1.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, relative } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Recursively find all .json files under a directory.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function findJsonFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonFiles(fullPath));
    } else if (entry.name.endsWith('.json') && !entry.name.endsWith('.tmp')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Load and parse a record file. Returns null on parse failure.
 *
 * @param {string} filePath
 * @returns {object|null}
 */
function loadRecord(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Rebuild all indexes from the records directory.
 *
 * @param {string} repoRoot - Absolute path to dogfood-labs repo root
 * @param {object} [options]
 * @param {number} [options.staleDays=30] - Days after which a surface is stale
 * @returns {{ latestByRepo: object, failing: object[], stale: object[] }}
 */
export function rebuildIndexes(repoRoot, options = {}) {
  const { staleDays = 30 } = options;
  const indexDir = join(repoRoot, 'indexes');
  mkdirSync(indexDir, { recursive: true });

  // Collect all records (accepted + rejected)
  const recordsDir = join(repoRoot, 'records');
  const acceptedFiles = findJsonFiles(recordsDir)
    .filter(f => {
      const rel = relative(recordsDir, f);
      return !rel.startsWith('_rejected/') && !rel.startsWith('_rejected\\');
    });
  const rejectedFiles = findJsonFiles(join(repoRoot, 'records', '_rejected'));

  const allRecords = [];

  for (const f of [...acceptedFiles, ...rejectedFiles]) {
    const record = loadRecord(f);
    if (record && record.run_id) {
      record._path = relative(repoRoot, f);
      allRecords.push(record);
    }
  }

  // --- latest-by-repo.json ---
  // Keyed by repo, then product_surface. Only accepted records count.
  const latestByRepo = {};

  for (const record of allRecords) {
    if (record.verification?.status !== 'accepted') continue;

    const repo = record.repo;
    if (!latestByRepo[repo]) latestByRepo[repo] = {};

    for (const sr of record.scenario_results || []) {
      const surface = sr.product_surface;
      const existing = latestByRepo[repo][surface];

      const finishedAt = record.timing?.finished_at;
      if (!existing || finishedAt > existing.finished_at) {
        latestByRepo[repo][surface] = {
          run_id: record.run_id,
          verified: record.overall_verdict?.verified,
          verification_status: 'accepted',
          finished_at: finishedAt,
          path: record._path
        };
      }
    }
  }

  // --- failing.json ---
  // Latest accepted records where verified verdict is not "pass"
  const failing = [];

  for (const [repo, surfaces] of Object.entries(latestByRepo)) {
    for (const [surface, entry] of Object.entries(surfaces)) {
      if (entry.verified !== 'pass') {
        failing.push({
          repo,
          surface,
          run_id: entry.run_id,
          verified: entry.verified,
          finished_at: entry.finished_at,
          path: entry.path
        });
      }
    }
  }

  // --- stale.json ---
  // Surfaces where the latest accepted record is older than staleDays
  const stale = [];
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();

  for (const [repo, surfaces] of Object.entries(latestByRepo)) {
    for (const [surface, entry] of Object.entries(surfaces)) {
      if (entry.finished_at < cutoff) {
        const ageDays = Math.floor(
          (Date.now() - new Date(entry.finished_at).getTime()) / (24 * 60 * 60 * 1000)
        );
        stale.push({
          repo,
          surface,
          run_id: entry.run_id,
          finished_at: entry.finished_at,
          age_days: ageDays,
          path: entry.path
        });
      }
    }
  }

  // Write indexes
  const latestPath = join(indexDir, 'latest-by-repo.json');
  const failingPath = join(indexDir, 'failing.json');
  const stalePath = join(indexDir, 'stale.json');

  const tmpSuffix = randomBytes(4).toString('hex');
  const latestTmp = `${latestPath}.${tmpSuffix}.tmp`;
  const failingTmp = `${failingPath}.${tmpSuffix}.tmp`;
  const staleTmp = `${stalePath}.${tmpSuffix}.tmp`;

  writeFileSync(latestTmp, JSON.stringify(latestByRepo, null, 2) + '\n', 'utf-8');
  renameSync(latestTmp, latestPath);
  writeFileSync(failingTmp, JSON.stringify(failing, null, 2) + '\n', 'utf-8');
  renameSync(failingTmp, failingPath);
  writeFileSync(staleTmp, JSON.stringify(stale, null, 2) + '\n', 'utf-8');
  renameSync(staleTmp, stalePath);

  return { latestByRepo, failing, stale };
}
