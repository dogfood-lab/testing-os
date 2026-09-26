# runners-unattributed

An Atlas fixture for test steps whose runner Atlas cannot attribute: a step
named Run tests that runs `make check`, whose recipe calls a program the
repository does not hold, and an unnamed `npm test` whose script calls one.
A step named Integration tests runs scripts/ci.sh, which runs a second
script Atlas reads no further. All three read "not attributed", never absent. The lint step runs no tests and is
not listed, and neither is a step whose name holds a word like testing only
as part of a name (Dispatch to testing-os).
