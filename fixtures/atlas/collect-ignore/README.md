# collect-ignore

An Atlas fixture for scripts named like tests that pytest never collects,
the shape sprite-foundry has: `conftest.py` sets
`collect_ignore_glob = ["pipeline/test_*.py"]`, keeping two GPU scripts
out of the suite. They are no tests, so the page never lists them among
the test files no workflow runs; `tests/test_unrun.py` is one.
