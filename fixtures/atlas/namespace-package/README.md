# namespace-package

An Atlas fixture for a namespace package at the repository root, the shape
sprite-foundry's `pipeline/` has: no `__init__.py`, a root `conftest.py`
that puts the root on pytest's path, and a test that does
`from pipeline import ingest`. The import is `pipeline/ingest.py`.
