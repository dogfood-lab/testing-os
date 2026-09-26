# runners-local-workflow

An Atlas fixture for a local reusable workflow: main.yml calls
.github/workflows/tests.yml, whose job runs `npm test`, and the test script
runs Vitest. The calling workflow's runner is attributed to Vitest through the
called workflow and the script.
