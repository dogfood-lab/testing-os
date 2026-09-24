# test-readers

An Atlas fixture. scripts/gen.mjs writes two fixture files; a workflow runs
it and commits them. A test reads fixtures/golden.json by its path, and
nothing reads fixtures/other.json.
