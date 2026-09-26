# runners-verify

An Atlas fixture for roll's shape: CI runs `npm run verify`, which builds,
type-checks and then runs `npm test`, and the test script runs Vitest. The
runner is attributed to Vitest through both scripts.
