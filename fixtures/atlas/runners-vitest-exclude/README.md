# runners-vitest-exclude

An Atlas fixture for a test file the runner's own configuration leaves out
on purpose: vitest.config.ts includes test/**/*.test.ts and excludes
test/smoke/**, so CI's `npm test` runs test/sum.test.ts and never
test/smoke/corpus.test.ts, an opt-in run against real data. The map says
the smoke test is run by no workflow, and that vitest.config.ts is what
leaves it out. claude-synergy and attestia keep suites out of CI this way.
