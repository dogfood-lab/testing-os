import { test } from 'node:test';
import assert from 'node:assert/strict';

const CASES = [
  { name: 'alpha', mod: '../scripts/alpha.js' },
  { name: 'beta', mod: '../scripts/beta.js' },
];

test('each script refuses to run without a project', async (t) => {
  for (const { name, mod } of CASES) {
    await t.test(name, async () => {
      const { run } = await import(mod);
      await assert.rejects(() => run([]));
    });
  }
});
