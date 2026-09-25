# python-spawns

An Atlas fixture for Python that runs modules under its own interpreter,
the shapes prompt-craft, xrpl-lab and ai-eyes-mcp have: verify.py runs
pytest and ruff through sys.executable, once held in a name, and CI hands
python -c code that imports the package's check module.
