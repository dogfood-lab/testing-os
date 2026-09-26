# spawn-shapes

An Atlas fixture for four ways a test starts the program it tests that the
fleet run found Atlas missing:

- test/promisify.test.ts runs bin/one.js through execFile made a promise,
  `const execFileAsync = promisify(execFile)` (registry-stats).
- test/flag.test.js runs bin/two.js with a flag whose value is computed at
  run time before it, `node --import <loader> bin/two.js` (si-rpg-engine).
- test/helper.test.ts runs bin/three.js through a helper that hands its
  program and its arguments to spawn, `runProcess(cmd, args)`
  (vocal-synth-engine).
- tests/version.rs runs the crate's binary, four, by the path Cargo gives
  an integration test, `env!("CARGO_BIN_EXE_four")` (saints-mile).
