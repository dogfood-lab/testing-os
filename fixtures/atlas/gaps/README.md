# gaps

An Atlas fixture where every test-gap rule fires (docs/atlas-test-gaps.spec.md):

- G1: tools/ is Python, and nothing in this JavaScript repository runs or
  holds a Python test.
- G2: e2e/flow.test.ts runs in no workflow, since CI runs `vitest run --dir test`.
- G3: package.json installs gapcli, and no test runs it.
- G4: CI runs Vitest without coverage.
- G6: src/parse.ts catches and throws, and no test imports or runs it.

Seven code gaps with known fan-in, history and failure paths pin the ranking:
src/format.ts (two importers), src/parse.ts (one, two failure paths),
src/index.ts and src/extra.ts (none, told apart by history), then the parts
lib (one importing part), bin and tools. The five highest are listed, with a
count of the rest. The test that runs only test/core.test.ts reaches
src/core.ts and src/util.ts. atlas/boundaries.yaml names the same parts the
rule tests hand the engine, so `atlas gaps` answers from a map of them.
