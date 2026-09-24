# xrpl-camp: how it works

Mapped at 2026-09-24 from commit 8af7371.

## What this is

7 parts, mostly Python (31 files). Work enters through 7 doors; the busiest is CI, which reaches 4 parts. It publishes to npm and PyPI, and a container image. People run xrpl-camp.

## What changed since 2026-09-23 (d3e4b7d)

- bin no longer imports the repository root.
- CI's pull request trigger now also names `atlas/**`.
- CI's push trigger now also names `atlas/**`.
- Publish now also runs docker-entrypoint.sh, xrpl_camp/__main__.py and xrpl_camp/cli.py.
- And 1 more change to a door.
- CHANGELOG.md is now read by tests/test_version.py.
- README.md is now read by pyproject.toml.
- bin/xrpl-camp.js is now read by tests/test_version.py.
- And 3 more new writers and readers of places.
- 77 files changed content, across 6 parts.

## What comes in

1. **CI.** On a pull request touching 11 paths; on a push touching 11 paths; or by hand. Runs scripts/check-versions.sh, scripts/verify.sh and tests/; checks bin/xrpl-camp.js and xrpl_camp/.
2. **Publish.** When a tag matching `v*` is pushed; or by hand. On a tag push, it runs docker-entrypoint.sh, scripts/verify-pypi-publish.sh, xrpl_camp/__main__.py and 1 more; checks LICENSE, README.md, pyproject.toml and 10 more.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **Release (npm).** When a tag matching `v*` is pushed; or by hand. Runs scripts/check-versions.sh.
5. **Freshness Check.** On a schedule (`0 8 * * 1`), Monday at 08:00 UTC; or by hand. Runs scripts/check-freshness.sh.
6. **xrpl-camp** (a command people run, from package.json). Runs bin/xrpl-camp.js.
7. **xrpl-camp** (a command people run, from pyproject.toml). Runs xrpl_camp/cli.py.

## What happens through CI

1. The workflow runs scripts/check-versions.sh and scripts/verify.sh in scripts and tests/ in tests; it checks bin/xrpl-camp.js in bin and xrpl_camp/ in xrpl_camp.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Publish** runs docker-entrypoint.sh, scripts/verify-pypi-publish.sh, xrpl_camp/__main__.py and 1 more and checks LICENSE, README.md, pyproject.toml and 10 more on a tag push, publishes to PyPI and a container image on a tag push, and creates a GitHub release on a tag push.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Release (npm)** runs scripts/check-versions.sh and publishes to npm.

**Freshness Check** runs scripts/check-freshness.sh, writes to .github/freshness-report.md, commits .github/freshness-report.md and pushes to a branch for review, never to main, and opens a pull request.

**xrpl-camp** (a command people run, from package.json) runs bin/xrpl-camp.js.

**xrpl-camp** (a command people run, from pyproject.toml) runs xrpl_camp/cli.py.

## What breaks what

- **scripts** is imported by no other part and sits on the path of 4 doors.
- **xrpl_camp** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.
- **bin** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **xrpl_camp/cli.py** and **xrpl_camp/lessons.py** changed together in 5 of 8 commits, inside the xrpl_camp part.
- **xrpl_camp/__init__.py** and **xrpl_camp/lessons.py** changed together in 4 of 8 commits, inside the xrpl_camp part.

Confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **bin** is imported by no test.

## Written but never read

- **.github/freshness-report.md** is written by .github/workflows/freshness-check.yml and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **.github/freshness-report.md** is written by .github/workflows/freshness-check.yml.

## Hand-authored

People write the repository root, scripts/ and site/; 4 writes with paths built at run time may land here.

## Where to start

bin/xrpl-camp.js

Read those in order to follow one run of xrpl-camp end to end. This path follows xrpl-camp (a command people run, from package.json) from its entry, since CI runs only tests.

## What this map cannot see

- 1 import site could not be resolved.
- 4 writes and 11 reads use paths built at run time and are not named here.
- 1 write goes to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
