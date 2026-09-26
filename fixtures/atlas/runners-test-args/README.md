# runners-test-args

An Atlas fixture for arguments handed to a package's test script from the
command line: `npm test -- --coverage`, `pnpm test --coverage` and
`yarn test --coverage` each run the test script, Vitest, with the flag
appended, so each run collects coverage. claude-guardian and multi-claude
collect coverage this way.
