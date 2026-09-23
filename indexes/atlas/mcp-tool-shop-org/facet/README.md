# facet: how it works

Mapped at 2026-09-23 from commit 8d2fa34.

## What this is

10 parts, mostly Python (292 files). Work enters through 4 doors; the busiest is ci, which reaches 2 parts. It publishes to npm and PyPI. People run facet.

## What changed since 2026-09-23 (7c06851)

- facet (package.json) is a new command. It runs bin/facet.js.
- 1 file changed content, across 1 part.

## What comes in

1. **ci.** On a push touching 10 paths; or by hand. Runs tests/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs no file this map can see.
3. **Release.** When a tag matching `v*` is pushed; or by hand. Runs no file this map can see.
4. **facet** (a command people run). Runs bin/facet.js.

## What happens through ci

1. The workflow runs tests/ in tests.
2. That reaches tools (3 files).

## Who reads the results

ci writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs no file this map can see and deploys the site.

**Release** runs no file this map can see, publishes to npm and PyPI, and creates a GitHub release.

**facet** (a command people run) runs bin/facet.js.

## What breaks what

- **tools** is imported only from tests, by 1 part (tests), and sits on the path of 1 door.

## What tends to change together

- **tests/test_t41_instrument_census.py** and **tools/instrument_census.py** changed together in 8 of 9 commits, and the tests part imports the tools part.
- **bin/facet.js** and **tools/record_mcp.py** changed together in 10 of 15 commits, though neither part imports the other.
- **tests/test_t41_instrument_census.py** and **tests/test_t62_recorded_invocation_form.py** changed together in 6 of 10 commits, inside the tests part.
- **tests/test_t87_canon_gate.py** and **tools/canon_gate.py** changed together in 7 of 13 commits, and the tests part imports the tools part.
- **tests/test_t62_recorded_invocation_form.py** and **tools/instrument_census.py** changed together in 5 of 10 commits, and the tests part imports the tools part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 10 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **bin** is imported by no test.

## Written but never read

- **docs/experiments/E04-brush-prompts.json** is written by tools/diagnostics/e04_make_brush_prompts.py and read by nothing else in this repository.
- **site/src/content/docs/handbook/** is written by docs/handbook/sync_to_site.py and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **docs/experiments/E04-brush-prompts.json** is written by tools/diagnostics/e04_make_brush_prompts.py.
- **site/src/content/docs/handbook/** is written by docs/handbook/sync_to_site.py.

## Hand-authored

People write .claude/, .github/, canon/, profiles/ and the repository root. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → tests/ → tools/verify/rig_report.py

Read those in order to follow one push end to end.

## What this map cannot see

- 205 import sites could not be resolved.
- 306 writes and 153 reads use paths built at run time and are not named here.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
