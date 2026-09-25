# python-spawn-loop

An Atlas fixture for a gate script that loops over a literal list of
command lines and hands each to its own runner, the shape
comfy-preflight's `verify.py` has: `legs = [("pytest", [py, "-m",
"pytest", "-q"], None), ("pytest -O", [py, "-O", "-m", "pytest"], ...)]`,
then `for label, argv, env in legs: run(label, argv, env=env)`. Each
command line the list holds is run, so CI runs the tests pytest finds.
