# unlisted-runs

Atlas fixtures for test files a workflow runs that the page must not list
as run in no workflow, one repository per directory.

In pytest-expression/ the test step is the Codecov recipe's pytest line: a
`${{ … }}` expression that adds the coverage flags on one leg stands among
pytest's arguments, and `testpaths` in pyproject.toml names tests/. Actions
spells the expression out before the shell runs; it can add only flags, so
the command is read without it and pytest runs tests/.

In pytest-matrix/ the expression is a matrix value, a path to a test file.
It stays in the command, where pytest reads it as a word it cannot
resolve, so the files the run reaches are not listed, and no test is said
to run in no workflow.

In playwright/ a workflow runs `npm run test:e2e`, whose script is
`playwright test`. Atlas names the runner from the command alone and lists
none of its files, so e2e/smoke.spec.ts, a file it may run, is not a test
no workflow runs.
