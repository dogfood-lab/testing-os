import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/action-inputs: a file handed to a local action as an
// input, which another job of the workflow writes (see the fixture's
// README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/action-inputs');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a file a local action is handed as an input', () => {
  it('is read by the job that hands it', () => {
    const root = makeRepo(FIXTURE);
    roots.push(root);
    const mapped = mapRepository({ repoPath: root, boundaries: [{ name: 'all', globs: ['**'] }] });
    const ci = mapped.doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.ok(ci.mentions.some((mention) => mention.path === 'docs/baseline.json' && mention.job === 'gate'), JSON.stringify(ci.mentions));
    const landing = mapped.landings.find((entry) => entry.target === 'docs/baseline.json');
    assert.ok(landing.readers.some((entry) => entry.by === '.github/workflows/ci.yml'), JSON.stringify(landing));
  });
});
