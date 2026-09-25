# package-dir-scripts

An Atlas fixture for commands whose package installs from a directory of
another name, the shape fx-dub has: `package-dir = { fxdub = "tools" }`,
and `[project.scripts]` names `fxdub.receipt:main`. The module is
`tools/receipt.py`, so the command is a door that runs it.
