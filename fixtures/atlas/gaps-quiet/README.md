# gaps-quiet

An Atlas fixture where no test-gap rule fires, each shape of the gaps fixture
closed (docs/atlas-test-gaps.spec.md):

- G1: tools/ is Python, and tools/test_report.py tests it.
- G2: every test file runs: CI runs Vitest over test/ and pytest over tools/.
- G3: test/cli.test.ts runs quietcli, the command package.json installs.
- G4: both runs collect coverage.
- G6: src/parse.ts catches and throws, and test/parse.test.ts imports it.
