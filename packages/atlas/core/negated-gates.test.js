import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { sendPhrases } from '../adapter/page.js';
import { mapRepository } from './index.js';
import { makeRepo } from './fixture-repo.js';

// fixtures/atlas/negated-gates: a deploy job and a publish job each held off
// a pull request by a negated event test, != and !( == ).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/negated-gates');
const roots = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function door(file) {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  return mapRepository({ repoPath: root, boundaries: [] }).doors.find((item) => item.file === file);
}

describe('a job held off one trigger', () => {
  it('sends only on the trigger that is left, worded as that trigger', () => {
    const pages = door('.github/workflows/pages.yml');
    assert.equal(pages.sends.deploysPages, false);
    // The workflow also runs by hand, which the gate does not hold off.
    assert.deepEqual(pages.gated.map((entry) => entry.when), [{ branches: ['main'], byHand: true, event: 'push' }]);
    assert.deepEqual(sendPhrases(pages), ['deploys the site on a push to main or by hand']);
  });

  it('names the trigger it is held off when more than one is left', () => {
    const nightly = door('.github/workflows/nightly.yml');
    assert.equal(nightly.sends.publishes, false);
    assert.deepEqual(nightly.gated.map((entry) => entry.when), [{ except: ['pull_request'] }]);
    assert.deepEqual(sendPhrases(nightly), ['publishes to npm except on a pull request']);
  });
});
