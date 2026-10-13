import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isScriptTestName, isTestFile } from './test-names.js';

// testing-os#158: role-os keeps self-running test scripts named test_*.mjs
// that no workflow runs, and Atlas read them as code.
const SCRIPT_NAMES = ['test_gate.mjs', 'test_gate.js', 'test_gate.cjs', 'test_gate.ts', 'test_gate.mts', 'test_gate.cts', 'test_gate.tsx', 'test_gate.jsx'];

describe('a script named as a test', () => {
  it('is a test_ name in the JS and TS family', () => {
    for (const name of SCRIPT_NAMES) assert.equal(isScriptTestName(`tools/${name}`), true, name);
    assert.equal(isScriptTestName('tools/test_gate.py'), false);
    assert.equal(isScriptTestName('tools/a.test.mjs'), false);
  });

  it('leaves a name with test but no test_ marker alone', () => {
    for (const name of ['testing.mjs', 'test.mjs', 'contest_x.mjs', 'my_test_helpers.mjs', 'test_data.json', 'test_x.md']) {
      assert.equal(isScriptTestName(`src/${name}`), false, name);
    }
  });

  it('is not a test by its name alone, so no runner is said to discover it', () => {
    // node --test, vitest and jest match .test., .spec., -test, _test, test-
    // and test/ names; none collects test_*.mjs. pytest collects test_*.py.
    for (const name of SCRIPT_NAMES) assert.equal(isTestFile(`tools/${name}`), false, name);
    assert.equal(isTestFile('tools/test_gate.py'), true);
  });
});
