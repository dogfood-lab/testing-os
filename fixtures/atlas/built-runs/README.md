# built-runs

An Atlas fixture. CI builds `src/` into `dist/` with `tsc` and then runs the
built CLI twice, as `node dist/cli.js` and as `./dist/cli.js`. `dist/` is
ignored, so neither path is tracked; both are the CLI compiled from `src/cli.ts`.
