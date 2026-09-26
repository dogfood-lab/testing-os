# portlight: how it works

Mapped at 2026-09-26 from commit 3b13579 by Atlas 1.23.0.

## What this is

12 parts, mostly Python (183 files), JavaScript (3), CSS (2), TypeScript (2), Astro (1) and shell (1). Work enters through 6 doors; CI, Release and Release Binaries each reach 2 parts, and CI is followed because a pull request goes through it. It publishes to npm and PyPI. It deploys a site to GitHub Pages. People run portlight.

## What changed since 2026-09-25 (7c76f54)

- Release Binaries now also runs src/portlight/app/cli.py, src/portlight/balance/runner.py and src/portlight/stress/invariants.py.
- Release now also runs src/portlight/app/cli.py, src/portlight/balance/runner.py and src/portlight/stress/invariants.py.
- artifacts/balance/balance-report.json is now written by src/portlight/balance/reporting.py.
- artifacts/balance/balance-report.md is now written by src/portlight/balance/reporting.py.
- artifacts/stress/stress-report.json is now written by src/portlight/stress/reporting.py.
- And 1 more new writer or reader of a place.
- artifacts was authored and is now generated.
- No file changed.

## What comes in

1. **CI.** On a pull request to main touching 8 paths; on a push to main touching 8 paths; or by hand. Runs tests/; checks src/.
2. **Release.** When a release is published; or by hand. Runs src/portlight/app/cli.py, src/portlight/balance/runner.py, src/portlight/stress/invariants.py and 77 more; checks src/.
3. **Release Binaries.** When a release is published; or by hand. Runs src/portlight/app/cli.py, src/portlight/balance/runner.py, src/portlight/stress/invariants.py and 77 more; builds src/portlight/__main__.py; checks src/.
4. **Deploy Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
5. **portlight** (a command people run, from package.json). Runs bin/portlight.js.
6. **portlight** (a command people run, from pyproject.toml). Runs src/portlight/app/cli.py.

## What happens through CI

1. The workflow runs tests/ in tests; it checks src/ in src.
2. It writes to artifacts/balance/balance-report.json and artifacts/balance/balance-report.md.

## Who reads the results

- **artifacts/balance/** is read by tools/run_balance.py.

## The other doors

**Release** runs src/portlight/app/cli.py, src/portlight/balance/runner.py, src/portlight/stress/invariants.py and 77 more, checks src/, writes to artifacts/balance/balance-report.json and artifacts/balance/balance-report.md, and publishes to npm and PyPI.

**Release Binaries** runs src/portlight/app/cli.py, src/portlight/balance/runner.py, src/portlight/stress/invariants.py and 77 more, checks src/, writes to artifacts/balance/balance-report.json and artifacts/balance/balance-report.md, and builds src/portlight/__main__.py into binaries for darwin-arm64, linux-x64 and win-x64 and uploads them to the release, on a release event.

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

test/version.test.js runs in no workflow.

verify.sh runs in no workflow.

## Written but never read

- **artifacts/balance/balance-report.json** is written by src/portlight/balance/reporting.py and read by nothing else in this repository.
- **artifacts/balance/balance-report.md** is written by src/portlight/balance/reporting.py and read by nothing else in this repository.
- **artifacts/stress/stress-report.json** is written by src/portlight/stress/reporting.py and read by nothing else in this repository.
- **artifacts/stress/stress-report.md** is written by src/portlight/stress/reporting.py and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **artifacts/** is written by src/portlight/balance/reporting.py and src/portlight/stress/reporting.py when run from the repository root, and committed.

## Hand-authored

People write .github/, docs/, the repository root, site/, world-map/ and world/. Nothing in this repository writes to them.

## Where to start

src/portlight/app/cli.py → src/portlight/app/session.py → src/portlight/engine/ship_stats.py → src/portlight/engine/encounter.py → src/portlight/engine/models.py → src/portlight/engine/naval.py

Read those in order to follow one run of portlight end to end. This path follows portlight (a command people run, from pyproject.toml) from its entry, since CI runs only tests and checks.

## What this map cannot see

- 2 imports could not be resolved: `src/portlight/app/tui/screens/encounter.py` imports `portlight.content.weapons`, which is no module on its import path and no declared dependency, twice.
- 1 read uses a path built at run time and is not named here.
- 2 writes and 129 reads go to a path their caller passes, not to this repository.
- 4 writes go to the directory the command is run in (artifacts/) or a path their caller passes, not to this repository.
- 2 reads go to the directory the command is run in, not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
