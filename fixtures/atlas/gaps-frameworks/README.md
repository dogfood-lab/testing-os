# gaps-frameworks

An Atlas fixture for G2 naming the runner each test file is written for,
read from what the file imports:

- other/d.test.ts imports vitest and sits outside vitest.config.ts's
  include, so Vitest's own discovery would collect it.
- e2e/b.spec.ts imports @playwright/test, and no workflow runs
  Playwright, so the suggestion is to run it with Playwright, not Vitest
  (vocal-synth-engine).
- lib/y.test.js imports node:test and is left out by the shell: npm runs
  `node --test lib/**/*.test.js` under sh, which reads ** as *, so only
  lib/deep/x.test.js runs (repo-dataset, stillpoint).

And two it must stay silent on:

- vitest.config.ts leaves test/slow/ out on purpose (attestia,
  claude-synergy), so test/slow/corpus.test.ts gets no G2.
- CI runs AVA, whose test files Atlas does not list, so ava/one.test.js,
  which imports ava, may be among them and gets no G2 (world-forge's
  Playwright specs).
- scripts/test_gate.py imports no test framework and runs itself under
  `python`, recording failures rather than raising them, so pytest would
  pass it whatever it found; with no runner of its family in CI, Atlas
  names none rather than guess (role-os).
