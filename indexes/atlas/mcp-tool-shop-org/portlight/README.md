# portlight: how it works

Mapped at 2026-09-25 from commit 3b13579.

## What this is

12 parts, mostly Python (183 files), JavaScript (3) and TypeScript (2). Work enters through 6 doors; CI, Release and Release Binaries each reach 2 parts, and CI is followed because a pull request goes through it. It publishes to npm and PyPI. People run portlight.

## What changed since 2026-09-25 (7c76f54)

Nothing structural changed since 2026-09-25; no file changed.

## What comes in

1. **CI.** On a pull request touching 8 paths; on a push to main touching 8 paths; or by hand. Runs tests/; checks src/.
2. **Release.** When a release is published; or by hand. Runs tests/; checks src/.
3. **Release Binaries.** When a release is published; or by hand. Runs tests/; builds src/portlight/__main__.py; checks src/.
4. **Deploy Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
5. **portlight** (a command people run, from package.json). Runs bin/portlight.js.
6. **portlight** (a command people run, from pyproject.toml). Runs src/portlight/app/cli.py.

## What happens through CI

1. The workflow runs tests/ in tests; it checks src/ in src.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs tests/, checks src/, and publishes to npm and PyPI.

**Release Binaries** runs tests/, checks src/, and builds src/portlight/__main__.py into binaries for darwin-arm64, linux-x64 and win-x64 and uploads them to the release on a release event.

**Deploy Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**portlight** (a command people run, from package.json) runs bin/portlight.js.

**portlight** (a command people run, from pyproject.toml) runs src/portlight/app/cli.py.

## What breaks what

- **src** is imported by 1 part (tools), and by 1 more only from tests; it sits on the path of 4 doors.
- **tests** is imported by no other part and sits on the path of 3 doors.

## What tends to change together

- **src/portlight/app/cli.py** and **src/portlight/app/session.py** changed together in 7 of 10 commits, inside the src part.
- **src/portlight/app/tui/app.py** and **src/portlight/app/tui/screens/dashboard.py** changed together in 5 of 8 commits, inside the src part.
- **src/portlight/app/cli.py** and **src/portlight/app/tui/screens/encounter.py** changed together in 6 of 10 commits, inside the src part.
- **src/portlight/app/session.py** and **src/portlight/app/tui/screens/encounter.py** changed together in 5 of 10 commits, inside the src part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **bin** is imported by no test.
- **tools** is imported by no test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, docs/, the repository root, site/, world-map/ and world/; 5 writes with paths built at run time may land here.

## Where to start

src/portlight/app/cli.py

Read those in order to follow one run of portlight end to end. This path follows portlight (a command people run, from pyproject.toml) from its entry, since CI runs only tests.

## What this map cannot see

- 2 import sites could not be resolved.
- 5 writes and 1 read use paths built at run time and are not named here.
- 1 write and 4 reads go to the directory the command is run in, not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
