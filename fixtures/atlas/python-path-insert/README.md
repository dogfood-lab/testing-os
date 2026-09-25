# python-path-insert

An Atlas fixture for Python files that put a directory on their own import
path before importing from it, the shapes schumann-surface and fx-dub
have: `tests/test_chain.py` inserts `join(dirname(__file__), "..",
"scripts")`, and `tests/test_tools.py` inserts `Path(__file__).parent.parent
/ "tools"`. Each bare import then resolves to the module in that
directory.
