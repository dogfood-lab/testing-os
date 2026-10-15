import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pnpmMajor } from './lib/codecov/runners.mjs';

const noPackage = () => null;
const withManager = (packageManager) => (path) => (path === 'package.json' ? JSON.stringify({ packageManager }) : null);

const step = (inputs) => ['jobs:', '  ci:', '    steps:', '      - uses: pnpm/action-setup@v4', ...inputs, '      - run: pnpm test', ''].join('\n');

describe('the pnpm major a repository runs its scripts with', () => {
  it('takes the packageManager field first', () => {
    assert.equal(pnpmMajor(withManager('pnpm@9.15.4'), step(['        with:', '          version: 10'])), 9);
  });

  it("reads the action's version input, quoted or not", () => {
    assert.equal(pnpmMajor(noPackage, step(['        with:', '          version: 10'])), 10);
    assert.equal(pnpmMajor(noPackage, step(['        with:', '          version: "8.15"'])), 8);
    assert.equal(pnpmMajor(noPackage, step(['        with:', "          version: '11.4.0'"])), 11);
  });

  it('finds nothing when the action names no version', () => {
    assert.equal(pnpmMajor(noPackage, step([])), null);
    assert.equal(pnpmMajor(noPackage, step(['        with:', '          run_install: false'])), null);
    assert.equal(pnpmMajor(noPackage, undefined), null);
  });

  it('finds the version of a second use of the action', () => {
    const text = `${step([])}      - uses: pnpm/action-setup@v4\n        with:\n          version: 9\n`;
    assert.equal(pnpmMajor(noPackage, text), 9);
  });

  it('answers a step with many indented lines and no version at once', () => {
    // The lazy repeat over indented lines once took exponential time to fail: 6 such lines took
    // 2 s, 7 about 18 s and 8 nearly 3 minutes. 7 fails the old code in seconds without hanging
    // a run; 5000 shows the scan stays linear.
    for (const count of [7, 5000]) {
      const many = Array.from({ length: count }, (_, i) => `          key${i}: value ${i} ${' '.repeat(40)}`);
      const started = performance.now();
      assert.equal(pnpmMajor(noPackage, step(['        with:', ...many])), null);
      assert.ok(performance.now() - started < 1000, `${count} lines took ${Math.round(performance.now() - started)} ms`);
    }
  });
});
