# facet: how it works

Mapped at 2026-09-25 from commit 8d2fa34.

## What this is

10 parts, mostly Markdown (489 files); code in Python (292), JavaScript (2) and TypeScript (2). Work enters through 6 doors; the busiest is ci, which reaches 2 parts. It publishes to npm and PyPI. People run facet, facet-index and facet-mcp.

## What changed since 2026-09-23 (7c06851)

- Deploy site to GitHub Pages now also runs site/astro.config.mjs and site/src/.
- Release now also runs tools/facet_index.py and tools/record_mcp.py.
- Release now also checks tools/diagnostics/ and tools/verify/.
- And 3 more changes to doors.
- tools/diagnostics/front_padded.png is now written by tools/diagnostics/prep_front.py.
- .gitattributes is now read by tests/test_t06_line_endings.py.
- .github/workflows/release.yml is now read by tests/test_t27_packaging_shape.py.
- And 79 more new writers and readers of places.
- 1 file changed content, across 1 part.

## What comes in

1. **ci.** On a push touching 10 paths; or by hand. Runs tests/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **Release.** When a tag matching `v*` is pushed; or by hand. Runs tools/facet_index.py and tools/record_mcp.py; checks tools/diagnostics/ and tools/verify/.
4. **facet** (a command people run). Runs bin/facet.js.
5. **facet-index** (a command people run). Runs tools/facet_index.py.
6. **facet-mcp** (a command people run). Runs tools/record_mcp.py.

## What happens through ci

1. The workflow runs tests/ in tests.
2. That reaches tools (29 files).

## Who reads the results

ci writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Release** runs tools/facet_index.py and tools/record_mcp.py, checks tools/diagnostics/ and tools/verify/, publishes to npm and PyPI, and creates a GitHub release.

**facet** (a command people run) runs bin/facet.js.

**facet-index** (a command people run) runs tools/facet_index.py.

**facet-mcp** (a command people run) runs tools/record_mcp.py.

## What breaks what

- **tools** is imported only from tests, by 1 part (tests), and sits on the path of 4 doors.

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

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **docs/experiments/E04-brush-prompts.json** is written by tools/diagnostics/e04_make_brush_prompts.py.
- **site/src/content/docs/handbook/** is written by docs/handbook/sync_to_site.py.

## Hand-authored

People write .claude/, .github/, canon/, profiles/ and the repository root; 126 writes with paths built at run time may land here.

## Where to start

tools/record_mcp.py → tools/facet_index.py

Read those in order to follow one run of facet-mcp end to end. This path follows facet-mcp (a command people run) from its entry, since ci runs only tests.

## What this map cannot see

- 7 imports could not be resolved: `tests/conftest.py` imports a path built at run time; `tests/test_t25_mask_geometry.py` imports a path built at run time; `tests/test_t27_packaging_shape.py` imports a path built at run time; and 4 more.
- 126 writes and 100 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 391 writes and 91 reads go to a path their caller passes, not to this repository.
- 4 writes and 2 reads go to the directory the command is run in, not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
