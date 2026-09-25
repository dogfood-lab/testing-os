# unittest-discover

An Atlas fixture for a gate script that runs the suite with unittest,
the shape fx-dub's `verify.sh` has: it moves to its own directory with
`cd "$(dirname "$0")"`, runs `python -m unittest discover -s tests`, then
one case by name, and CI runs the script. The tests under `tests/` are
run, so none is said to run in no workflow.
