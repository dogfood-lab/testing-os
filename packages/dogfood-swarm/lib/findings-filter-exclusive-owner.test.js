/**
 * findings-filter-exclusive-owner.test.js — with the run's domains passed in,
 * findingsForDomain routes a finding with a path to that file's exclusive
 * owner only, the same arbitration collect enforces.
 *
 * Earned on commandui (run swarm-1791046650-fb76, wave 6): backend owned
 * `packages/**` and tests owned `packages/**\/*.test.*`. Glob membership
 * briefed every test-file finding to both, so two lanes were handed the same
 * file, and collect would flag whichever was not the owner.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { openMemoryDb } from '../db/connection.js';
import { findingsForDomain } from './findings-filter.js';

const DOMAINS = [
  { name: 'backend', globs: ['packages/**'], ownership_class: 'owned' },
  { name: 'tests', globs: ['packages/**/*.test.*'], ownership_class: 'owned' },
  { name: 'shared', globs: ['*.json'], ownership_class: 'shared' },
];

function seed(db) {
  const runId = 'run-owner';
  db.prepare(
    `INSERT INTO runs (id, repo, local_path, commit_sha, status) VALUES (?, 'org/repo', '/tmp/r', ?, 'health-amend-a')`
  ).run(runId, 'a'.repeat(40));
  const add = db.prepare(
    `INSERT INTO findings (run_id, finding_id, fingerprint, severity, category, file_path, description, status)
     VALUES (?, ?, ?, 'MEDIUM', 'bug', ?, 'd', 'approved')`
  );
  add.run(runId, 'F-src', 'fp-src', 'packages/state/src/index.ts');
  add.run(runId, 'F-test', 'fp-test', 'packages/state/src/index.test.ts');
  add.run(runId, 'F-json', 'fp-json', 'package.json');
  return runId;
}

const ids = (rows) => rows.map((f) => f.finding_id).sort();

describe('findingsForDomain — exclusive-owner routing', () => {
  it('sends a test-file finding to tests only, not also to backend', () => {
    const db = openMemoryDb();
    const runId = seed(db);
    const [backend, tests] = DOMAINS;
    assert.deepEqual(ids(findingsForDomain(db, runId, backend, DOMAINS)), ['F-src']);
    assert.deepEqual(ids(findingsForDomain(db, runId, tests, DOMAINS)), ['F-test']);
  });

  it('keeps the membership answer without the domain list', () => {
    const db = openMemoryDb();
    const runId = seed(db);
    assert.deepEqual(ids(findingsForDomain(db, runId, DOMAINS[0])), ['F-src', 'F-test']);
  });

  it('keeps a path no exclusive domain owns with every domain that matches it', () => {
    const db = openMemoryDb();
    const runId = seed(db);
    const routed = findingsForDomain(db, runId, DOMAINS[2], DOMAINS);
    assert.deepEqual(ids(routed), ['F-json']);
  });
});
