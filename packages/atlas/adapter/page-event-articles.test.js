import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gatePhrase, triggerPhrases } from './page.js';

// An event's name is said with the article its first sound takes.

describe('the article before an event name', () => {
  it('says an `issues` event and a `push` event', () => {
    assert.deepEqual(triggerPhrases({ triggers: [{ event: 'issues' }, { event: 'workflow_call' }] }), ['on an `issues` event', 'on a `workflow_call` event']);
    assert.equal(gatePhrase({ event: 'issues' }), 'on an `issues` event');
    assert.equal(gatePhrase({ except: ['issues', 'release'] }), 'except on an `issues` event or on a release event');
    assert.deepEqual(triggerPhrases({ triggers: [{ event: 'repository_dispatch', types: ['ingest'] }] }), ['when a repository sends an `ingest` event']);
  });
});
