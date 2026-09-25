# installed-cwd-writes

An Atlas fixture for a command people install that a workflow also runs
from this repository, the shape role-os has. The command writes
.tool/state.json and reports/out.json relative to where it runs; CI runs it
once and commits reports/, and nothing commits .tool/. What it writes where
it runs is the person's, except what the workflow commits.
