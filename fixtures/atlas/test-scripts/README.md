# test-scripts

An Atlas fixture for testing-os#158: scripts named `test_*` in the JavaScript
and TypeScript family. No runner's default discovery collects that name, so
such a script is a test only by what it does: it fails by itself (a non-zero
`process.exit` or `process.exitCode`, or an assert or test-framework import)
and no file imports it.

- `tools/test_gate.mjs` (assert import), `tools/test_exit.cjs` (exit code) and
  `tools/test_more.js` (exit code): run by no workflow, run with node.
- `checks/test_dir_script.mjs` sits in a directory `node --test checks/` is
  handed. Atlas counts every file under a directory a runner is handed as run,
  so it reads this script as run, though node collects only its default names
  there: a stated limit, on the side of no false gap.
- `tools/test_typed.ts`: the root manifest lists tsx, so `npx tsx`.
- `typed/test_strip.ts`: its manifest's engines strip types (>=22.18.0), so node.
- `legacy/test_old.ts`: engines >=20 and no runner, so no command.
- `tools/test_named.mjs`: imports node:test; named in the run, not discovered.
- `scripts/test_check.py` (exits 1 under its `__main__` guard) and
  `scripts/test_flat.py` (exits at module level): no Python runner in CI.
  `scripts/helper_exit.py` exits inside a function and carries no test name.
- Not tests, or run: `tools/test_helpers.mjs` (imported by a test),
  `tools/test_notes.mjs` (no check), `collected/test_collected.mjs` (vitest's
  include collects it), `scripts/test_bare.py` (bare asserts, no guard: a
  stated limit), `testdata/test_fixture.mjs` (fixture material).
