# runners-coverage

An Atlas fixture for whether a test run collects coverage and writes JUnit
results, read from how CI runs it: c8 around node --test; Vitest's
--coverage and junit reporter from a package script; node --test under a
step's NODE_V8_COVERAGE and NODE_OPTIONS; pytest's --cov and --junitxml on the
command line, and from a pyproject.toml's addopts; and a Vitest and a Jest
configuration that turn coverage on and name their junit reporter with its
options. A plain node --test collects neither.
