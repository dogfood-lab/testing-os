import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/gated-writes: a script two gated jobs run, and a place only
// one gated job writes (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/gated-writes');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('work split across gated jobs', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [{ name: 'bundles', globs: ['bundles/**'], role: 'data' }, { name: 'scripts', globs: ['scripts/**'], role: 'code' }];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const { markdown } = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/gated-writes' });

  it('keeps each job\'s gate on a file two jobs run', () => {
    const line = markdown.split('\n').find((text) => text.startsWith('1. **Operations.**'));
    assert.ok(!line.includes('Runs scripts/derive.mjs'), line);
    assert.ok(/Except on an? `issues` event, it (also )?runs scripts\/derive\.mjs/.test(line), line);
  });

  it('says a place only one gated job writes under that gate', () => {
    assert.ok(markdown.includes('On a schedule or by hand, it writes to bundles/all.json.'), markdown);
    assert.ok(!markdown.includes('It writes to bundles/all.json.'), markdown);
  });
});
