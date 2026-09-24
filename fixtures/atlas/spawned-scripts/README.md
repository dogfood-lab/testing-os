# spawned-scripts

An Atlas fixture for tests that run a script as a child process, the shapes
sensor-humor's CLI smoke tests use. tests/smoke.test.js runs
scripts/label.ts through tsx's cli.mjs under node, with every path joined
from a repository root constant, and hands the rest of its arguments on
with a spread. tests/run-gate.test.js runs scripts/gate.mjs under node the same
way. No test imports anything in scripts, so the part is touched only
through a spawn.
