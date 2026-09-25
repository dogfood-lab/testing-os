# workspace-paths

An Atlas fixture for a step that leaves the checkout and runs a script by
its path from the checkout's root, the shape site-theme's
validate-templates job has: `cd /tmp/test-site`, then
`node $GITHUB_WORKSPACE/cli/init.mjs init`. The script is this
repository's `cli/init.mjs`; a relative path in the same step names a file
of the temporary directory, never one of this repository.
