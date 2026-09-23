# syntax-checks

An Atlas fixture. CI only asks each interpreter whether a file parses:
`node -c` and `node --check`, `python -m py_compile` and `compileall`, and
`bash -n` and `sh -n`. None of them runs the file, so run.sh's own command
(`node bin/other.js`) never runs.
