# gaps-shapes

An Atlas fixture for the shapes the fleet run found the test-gap rules
wrong on, each of which must leave its rule silent:

- CI's "Smoke-test the CLI" step runs scripts/smoke.mjs, which starts
  bin/shapecli.mjs: both are run by a test step, so neither is a code gap
  and G3 is silent for shapecli (study-swarm).
- scripts/pack-smoke.mjs is a smoke test by its name, run by no workflow:
  its throw is an assertion, not a failure path to test.
- test/cli.test.ts imports src/cli.js and drives main() with arguments, so
  G3 is silent for importedcli, whose entry it is (the Python CliRunner
  shape).
- The dogfood workflow runs bin/dogfood.mjs as a person would, so G3 is
  silent for dogcli (claude-guardian).
- scripts/measure.py sits in a part of JavaScript; its G6 names pytest.
- fixtures/sample/pkg/__init__.py is material a test reads, never a gap.
