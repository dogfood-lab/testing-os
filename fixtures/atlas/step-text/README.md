# step-text

An Atlas fixture for a workflow step whose script holds strings a secret
scan looks for, the shape site-theme's lint job has: a heredoc of patterns
and a tree-wide `git grep` over them. The map records the programs the step
runs, never its script, so the scan finds nothing in `atlas/`.
