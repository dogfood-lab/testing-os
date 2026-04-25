/**
 * Record loader for the derivation engine.
 * Discovers and loads verified dogfood records from the filesystem.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

/**
 * Load all records for a specific repo.
 *
 * @param {string} rootDir - dogfood-labs repo root.
 * @param {string} repoKey - Full org/repo key (e.g. "mcp-tool-shop-org/repo-crawler-mcp").
 * @returns {Array<{ record: object, rejected: boolean, path: string }>}
 */
export function loadRecordsForRepo(rootDir, repoKey) {
  const [org, repo] = repoKey.split('/');
  const results = [];

  // Accepted records
  const acceptedDir = resolve(rootDir, 'records', org, repo);
  results.push(...walkRecords(acceptedDir, false));

  // Rejected records
  const rejectedDir = resolve(rootDir, 'records', '_rejected', org, repo);
  results.push(...walkRecords(rejectedDir, true));

  return results;
}

/**
 * Load a single record by run_id.
 *
 * @param {string} rootDir - dogfood-labs repo root.
 * @param {string} runId - The run_id to find.
 * @returns {{ record: object, rejected: boolean, path: string } | null}
 */
export function loadRecordById(rootDir, runId) {
  // Search accepted records
  const acceptedRoot = resolve(rootDir, 'records');
  const found = findRecordFile(acceptedRoot, runId, false);
  if (found) return found;

  // Search rejected records
  const rejectedRoot = resolve(rootDir, 'records', '_rejected');
  return findRecordFile(rejectedRoot, runId, true);
}

/**
 * Load all records across all repos.
 *
 * @param {string} rootDir - dogfood-labs repo root.
 * @returns {Array<{ record: object, rejected: boolean, path: string }>}
 */
export function loadAllRecords(rootDir) {
  const results = [];

  // Accepted records
  const recordsDir = resolve(rootDir, 'records');
  if (existsSync(recordsDir)) {
    for (const org of listDirs(recordsDir)) {
      if (org === '_rejected') continue;
      const orgDir = join(recordsDir, org);
      for (const repo of listDirs(orgDir)) {
        const repoDir = join(orgDir, repo);
        results.push(...walkRecords(repoDir, false));
      }
    }
  }

  // Rejected records
  const rejectedDir = resolve(rootDir, 'records', '_rejected');
  if (existsSync(rejectedDir)) {
    for (const org of listDirs(rejectedDir)) {
      const orgDir = join(rejectedDir, org);
      for (const repo of listDirs(orgDir)) {
        const repoDir = join(orgDir, repo);
        results.push(...walkRecords(repoDir, true));
      }
    }
  }

  return results;
}

/** Walk a record directory tree and load all .json files. */
function walkRecords(dir, rejected) {
  if (!existsSync(dir)) return [];
  const results = [];

  function walk(d) {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      try {
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (extname(entry) === '.json') {
          const data = JSON.parse(readFileSync(full, 'utf-8'));
          results.push({ record: data, rejected, path: full });
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  walk(dir);
  return results;
}

/** Find a specific record file by run_id pattern. */
function findRecordFile(rootDir, runId, rejected) {
  if (!existsSync(rootDir)) return null;

  function search(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) {
          const found = search(full);
          if (found) return found;
        } else if (extname(entry) === '.json' && entry.includes(runId)) {
          const data = JSON.parse(readFileSync(full, 'utf-8'));
          if (data.run_id === runId) {
            return { record: data, rejected, path: full };
          }
        }
      } catch {
        // Skip
      }
    }
    return null;
  }

  return search(rootDir);
}

function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => {
    try { return statSync(join(dir, name)).isDirectory(); }
    catch { return false; }
  });
}
