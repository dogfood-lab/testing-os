# comfy-preflight: how it works

Mapped at 2026-09-25 from commit 855e57c.

## What this is

8 parts, mostly Python (33 files), CSS (2), JavaScript (2), TypeScript (2) and Astro (1). Work enters through 5 doors; CI and Release each reach 3 parts, and CI is followed because a pull request goes through it. It publishes to npm and PyPI. It deploys a site to GitHub Pages. People run comfy-preflight.

## What changed since 2026-09-25 (93d683c)

- CI now also runs tests/.
- Release now also runs tests/.
- No file changed.

## What comes in

1. **CI.** On a pull request touching 9 paths; on a push touching 9 paths; or by hand. Runs verify.py and tests/; checks src/.
2. **Release.** When a tag matching `v*` is pushed; or by hand. Runs verify.py and tests/; builds src/comfy_preflight/cli.py; checks src/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **comfy-preflight** (a command people run, from package.json). Runs bin/comfy-preflight.js.
5. **comfy-preflight** (a command people run, from pyproject.toml). Runs src/comfy_preflight/cli.py.

## What happens through CI

1. The workflow runs verify.py in the repository root and tests/ in tests; it checks src/ in src.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs verify.py and tests/, checks src/, publishes to npm and PyPI, creates a GitHub release, and builds src/comfy_preflight/cli.py into binaries for Linux and Windows and uploads them to the release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**comfy-preflight** (a command people run, from package.json) runs bin/comfy-preflight.js.

**comfy-preflight** (a command people run, from pyproject.toml) runs src/comfy_preflight/cli.py.

## What breaks what

- **tests** is run as a child process by 1 part (the repository root) and sits on the path of 2 doors.
- **src** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.
- **the repository root** is imported by no other part and sits on the path of 2 doors.
- **tests/fixtures/graphs/** is written by tools and read by .github, the repository root and tools, and by 1 test; a hand edit reaches every reader.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **bin** is imported by no test.
- **tools** is imported by no test.

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

src/comfy_preflight/cli.py → src/comfy_preflight/graph.py → src/comfy_preflight/register.py → src/comfy_preflight/checks/c1_link_topology.py → src/comfy_preflight/aggregate.py → src/comfy_preflight/__init__.py

Read those in order to follow one run of comfy-preflight end to end. This path follows comfy-preflight (a command people run, from pyproject.toml) from its entry, since CI runs only tests, scripts that import no code here and checks.

## What this map cannot see

- 2 imports could not be resolved: `tests/test_packaging.py` imports a path built at run time, twice.
- 1 write and 3 reads use paths built at run time and are not named here.
- 4 writes and 5 reads go to a path their caller passes, not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
