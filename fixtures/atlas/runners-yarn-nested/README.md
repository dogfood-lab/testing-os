# runners-yarn-nested

An Atlas fixture for nested yarn scripts: CI runs `yarn test`, the test script
runs `yarn run unit`, and that script runs Mocha over test/. The runner is
attributed to Mocha through both scripts.
