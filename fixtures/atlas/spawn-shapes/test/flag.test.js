import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// A loader written at run time, so its path is known only then.
function noModel() {
  const file = join(mkdtempSync(join(tmpdir(), 'no-model-')), 'no-model.mjs');
  writeFileSync(file, 'globalThis.fetch = () => process.exit(9);\n');
  return pathToFileURL(file).href;
}

test('prints two', () => {
  const run = spawnSync(process.execPath, ['--import', noModel(), 'bin/two.js'], { encoding: 'utf8' });
  assert.match(run.stdout, /two/);
});
