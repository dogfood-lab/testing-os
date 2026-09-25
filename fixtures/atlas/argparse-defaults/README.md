# argparse-defaults

An Atlas fixture for a report whose directory is a literal argparse
default, the shape portlight's `tools/run_balance.py` has:
`--output` defaults to `artifacts/balance`, and the reports written under
it are committed. Run from the repository root with no `--output`, the
tool writes there, so `artifacts/balance/` is its output; a caller who
passes `--output` chooses another place.
