# turbo-runs

An Atlas fixture for turbo, the shape motif has. CI runs the root's build
and test scripts, which hand turbo the task; turbo runs it in every
workspace member whose package.json defines it: core builds and tests, ui
builds, and docs defines neither.
