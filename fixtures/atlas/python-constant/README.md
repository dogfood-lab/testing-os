# python-constant

An Atlas fixture for a command whose only import is its package's
version, the shape fx-dub and sprite-foundry have: `tool/cli.py` imports
`VERSION` from `tool/version.py`, which holds a docstring and that one
constant. A file that only holds a value does no work, so the path
never ends there: it starts and stops at cli.py.
