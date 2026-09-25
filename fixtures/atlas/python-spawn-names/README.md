# python-spawn-names

An Atlas fixture for a gate script that binds a command line to a name
before handing it to its own runner, the shape prompt-craft's `verify.py`
has: `pytest = [py, "-m", "pytest", "-q"]`, then `_run("suite", pytest)`.
The list the name holds is the command the runner starts, so CI runs the
tests pytest finds.
