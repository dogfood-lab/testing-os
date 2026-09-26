# reach-names

Tests that name the file they reach in a string, by ways the map cannot
follow to an import or a run:

- `tests/test_tools.py` runs `tools/tool_a.py` through the conftest helper
  `run_py('tool_a.py', ...)`, which joins the name to a directory it builds
  at run time (facet's shape).
- `test/gen.test.mjs` runs `scripts/gen.mjs` by a path joined to a root it
  imports from `test/helpers.mjs` (vocal-synth-engine's shape); `gen.mjs`
  imports `scripts/lib/util.mjs`.
- `scripts/pod_smoke.sh`, a smoke test by its name, runs `tools/tool_c.py`
  (ai-jam-sessions' shape).
- `tests/test_runs.py` names `run.py`, which two files are: the name says
  neither. Its docstring names `tools/tool_b.py`, as prose.

`tools/tool_b.py` no test names. `package.json` installs `scripts/gen.mjs`
as the command `gen`.
