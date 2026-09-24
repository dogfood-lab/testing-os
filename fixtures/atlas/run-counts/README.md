# run-counts

An Atlas fixture for how many files a door runs, the shape forkctl's CI has:
node --test is handed four test files by name and a glob that selects a
directory of five more, so the runs list holds five entries for nine files.
tests/helpers.js is not a test, so tests/ is not run whole.
