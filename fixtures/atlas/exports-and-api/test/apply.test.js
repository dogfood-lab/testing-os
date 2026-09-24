import { test } from 'node:test';
import { openIssue } from '../src/apply.js';

test('opens an issue against a stand-in', async () => {
  globalThis.fetch = async () => ({ ok: true });
  await openIssue('acme', 'widget', 'token');
});
