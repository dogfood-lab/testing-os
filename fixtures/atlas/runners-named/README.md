# runners-named

An Atlas fixture for runners Atlas names from the command alone, reading
none of their configuration: Playwright through npx and through pnpm, go
test and tox. Each is attributed, with no count of the tests it runs. A test
file node or python runs directly is a test run by that interpreter.

Atlas lists none of the files such a runner runs, so a test file it may run
is not one no workflow runs: e2e/app.spec.ts, written for Playwright, and
tests/test_more.py, which imports no framework and which tox may run.
src/sum.test.ts is written for Vitest, which no workflow runs: it is listed.
