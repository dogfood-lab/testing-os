# runners-npm-nested

An Atlas fixture for nested npm scripts: CI runs `npm test`, the test script
runs `npm run test:unit`, and that script runs Jest. The runner is attributed
to Jest through both scripts.
