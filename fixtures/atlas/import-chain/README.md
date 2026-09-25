# import-chain

An Atlas fixture for a Python entry that records no order of work (it
dispatches through a table), the shape accessibility-suite's
`a11y_ci/cli.py` has: it imports the package's
`__init__.py` (a version), `gate.py` and `render.py`, and `gate.py`
imports `scorecard.py`. The path goes from each file to one it imports,
the one that goes on first, so it reads cli.py → gate.py → scorecard.py;
never the entry's import list in order, and never into the package's
`__init__.py`.
