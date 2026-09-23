# mcp-stress-test: how it works

Mapped at 2026-09-23 from commit a8a79e8.

## What this is

6 parts, mostly Python (76 files). Work enters through 4 doors; the busiest is CI, which reaches 2 parts. It publishes to PyPI and a container image. People run mcp-stress.

## What changed since 2026-09-23 (be7da06)

- CI now also runs src/mcp_stress_test/cli/__init__.py.
- Deploy site to GitHub Pages now also runs site/astro.config.mjs and site/src/.
- Publish now also runs src/mcp_stress_test/cli/__init__.py.
- And 1 more change to a door.
- site/src/content/docs/ is now read by site/astro.config.mjs.
- site/src/content/docs/handbook/ is now read by site/astro.config.mjs.
- src/mcp_stress_test/patterns/data/ is now read by src/mcp_stress_test/patterns/library.py.
- And 1 more new writer or reader of a place.
- 134 files changed content, across 6 parts.

## What comes in

1. **CI.** On a pull request; on a push to main touching 8 paths; or by hand. Runs src/mcp_stress_test/cli/__init__.py and tests/; checks src/.
2. **Publish.** When a release is published; or by hand. Runs src/mcp_stress_test/cli/__init__.py and tests/.
3. **Deploy site to GitHub Pages.** On a pull request touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **mcp-stress** (a command people run). Runs src/mcp_stress_test/cli/__init__.py.

## What happens through CI

1. The workflow runs src/mcp_stress_test/cli/__init__.py in src and tests/ in tests; it checks src/ in src.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Publish** runs src/mcp_stress_test/cli/__init__.py and tests/, and publishes to PyPI and a container image.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on a push to main.

**mcp-stress** (a command people run) runs src/mcp_stress_test/cli/__init__.py.

## What breaks what

- **src** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.
- **tests** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **site** is imported by no test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, docs/ and the repository root; 15 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → src/mcp_stress_test/cli/__init__.py

Read those in order to follow one pull request end to end.

## What this map cannot see

- 2 import sites could not be resolved.
- 15 writes and 14 reads use paths built at run time and are not named here.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
