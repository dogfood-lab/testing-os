# runners-vitest-dir

An Atlas fixture for Vitest's --dir flag: the test script runs
`vitest run --dir src`, so Vitest looks for tests under src/ alone and never
runs e2e/flow.test.ts.
