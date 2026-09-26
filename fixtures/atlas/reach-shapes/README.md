# reach-shapes

An Atlas fixture for more ways the fleet's tests reach the file they test,
each of which must count as a test running or importing it:

- test/table.test.js imports each script under scripts/ from a table of
  literal paths it loops over, `for (const { mod } of CASES) await
  import(mod)` (style-dataset-lab).
- test/fork.test.js forks scripts/worker.mjs, `fork(helperPath)`
  (testing-os's ingest race test).
- test/helpers.test.js runs scripts/check.mjs through `runNode(args)` and
  scripts/sweep.mjs through `run(script, args)`, helpers that hand Node the
  argument list (ai-rpg-engine, mcp-arcade-cabinets).
- test/python.test.js runs tools/gen.py with the interpreter the
  environment names, or python, `spawnSync(PYTHON, [SCRIPT])`
  (style-dataset-lab, testing-os).
- CI's Launcher self-test step runs npm test in npm/, whose script is
  `node bin/launcher.mjs --node-selftest`: the step runs the launcher
  (armature).
