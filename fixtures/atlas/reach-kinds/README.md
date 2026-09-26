# reach-kinds

An Atlas fixture for the three ways a test reaches code, each with its basis:

- `src/direct.js` is imported by a test, and `src/deep.js` through the file
  a test imports (`imports`, parsed).
- `src/mocked.js` is mocked by the test that imports it; a mocked import is
  still an import.
- `bin/tool.js` is run by a test as a child process by its path (`runs`,
  parsed), and `bin/cli.js` by the command name package.json installs it as
  (`runs`, declared). `bin/both.js` a test both imports and runs: imports is
  the stronger fact, and the run is still known.
- `crate/src/lib.rs` holds its own unit tests, which cargo test finds
  (`discovers`, parsed).
- `src/unreached.js` no test imports or runs.
- `fixtures/demo/` is a repository a test reads: its test-shaped file is data,
  not a test, so it reaches nothing.

CI runs `npm test`, which runs Vitest over test/.
