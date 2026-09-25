# comfy-preflight: how it works

Mapped at 2026-09-25 from commit 855e57c.

## What this is

8 parts, mostly Python (33 files), JavaScript (2) and TypeScript (2). Work enters through 5 doors; CI and Release each reach 2 parts, and CI is followed because a pull request goes through it. It publishes to npm and PyPI. People run comfy-preflight.

## What changed since 2026-09-25 (93d683c)

Nothing structural changed since 2026-09-25; no file changed.

## What comes in

1. **CI.** On a pull request touching 9 paths; on a push touching 9 paths; or by hand. Runs verify.py; checks src/.
2. **Release.** When a tag matching `v*` is pushed; or by hand. Runs verify.py; builds src/comfy_preflight/cli.py; checks src/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **comfy-preflight** (a command people run, from package.json). Runs bin/comfy-preflight.js.
5. **comfy-preflight** (a command people run, from pyproject.toml). Runs src/comfy_preflight/cli.py.

## What happens through CI

1. The workflow runs verify.py in the repository root; it checks src/ in src.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs verify.py, checks src/, publishes to npm and PyPI, creates a GitHub release, and builds src/comfy_preflight/cli.py into binaries for Linux and Windows and uploads them to the release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**comfy-preflight** (a command people run, from package.json) runs bin/comfy-preflight.js.

**comfy-preflight** (a command people run, from pyproject.toml) runs src/comfy_preflight/cli.py.

## What breaks what

- **src** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.
- **the repository root** is imported by no other part and sits on the path of 2 doors.
- **tests/fixtures/graphs/** is written by tools and read by .github, the repository root and tools; a hand edit reaches every reader.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **bin** is imported by no test.
- **tools** is imported by no test.

13 test files run in no workflow: tests/test_aggregate.py, tests/test_c1_link_topology.py, tests/test_c2_register.py and 10 mores.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **tests/fixtures/MANIFEST.json** is written by tools/import_fixtures.py.
- **tests/fixtures/graphs/** is written by tools/import_fixtures.py.

## Hand-authored

People write .github/, docs/, the repository root and site/; 1 write with a path built at run time may land here.

## Where to start

CI runs no code this map can follow; it only checks code, so there is no path of files to read in order.

## What this map cannot see

- 2 imports could not be resolved: `tests/test_packaging.py` imports a path built at run time; `tests/test_packaging.py` imports a path built at run time.
- 1 write and 4 reads use paths built at run time and are not named here.
- 4 writes go to a path their caller passes, not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
