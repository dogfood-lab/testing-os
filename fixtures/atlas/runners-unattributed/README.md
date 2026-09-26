# runners-unattributed

An Atlas fixture for test steps whose runner Atlas cannot attribute: a step
named Run tests that runs `make check`, whose recipe calls a program the
repository does not hold, and an unnamed `npm test` whose script calls one.
A step named Integration tests runs scripts/ci.sh, which runs a second
script Atlas reads no further, and one named Headless suite runs a game
engine's own headless test script, as ai-rpg-stage's CI does. All four
read "not attributed", never absent, each with the files of this
repository it runs. A step that uploads the suite's log
runs no tests. The lint step runs no tests and is
not listed, and neither is a step whose name holds a word like testing only
as part of a name (Dispatch to testing-os).
