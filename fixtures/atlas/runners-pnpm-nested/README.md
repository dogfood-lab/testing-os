# runners-pnpm-nested

An Atlas fixture for nested pnpm scripts: CI runs `pnpm run ci`, which lints
and then runs `pnpm test`, and the test script runs Vitest with coverage. The
runner is attributed to Vitest through both scripts, and collects coverage.
