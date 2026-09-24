# spawned-parts

Code that starts other code as a child process, the way runforge-vscode and
rig-bridge do: src/runner.js runs the Python package under python/ with
`python -m jobs`, its interpreter handed in at run time, and src/git.js runs
git with arguments built at run time. The first connects src to python as an
edge a door reaches through; the second runs a tool from outside the
repository, which the page says without an edge.
