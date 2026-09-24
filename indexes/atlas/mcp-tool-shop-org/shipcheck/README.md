# shipcheck: how it works

Mapped at 2026-09-24 from commit 838720f.

## What this is

10 parts, mostly JavaScript (5 files). Work enters through 5 doors; the busiest is CI, which reaches 2 parts. It publishes to npm. People run shipcheck.

## What changed since 2026-09-23 (875a8ae)

- Deploy site to GitHub Pages now also runs site/astro.config.mjs and site/src/.
- repomesh-broadcast now also checks package.json.
- shipcheck (package.json) is a new command. It runs bin/shipcheck.mjs.
- CHANGELOG.md is now also read by test/shipcheck.test.mjs and test/version.test.mjs.
- LICENSE is now also read by test/shipcheck.test.mjs.
- README.md is now also read by test/front-door.test.mjs and test/shipcheck.test.mjs.
- And 8 more new writers and readers of places.
- 101 files changed content, across 10 parts.

## What comes in

1. **CI.** On a pull request touching 12 paths; on a push to main touching 12 paths; or by hand. Runs bin/shipcheck.mjs and test/.
2. **Release.** When a release is published; or by hand. Runs bin/shipcheck.mjs and test/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **repomesh-broadcast.** When a release is published. Checks package.json.
5. **shipcheck** (a command people run). Runs bin/shipcheck.mjs.

## What happens through CI

1. The workflow runs bin/shipcheck.mjs in bin and test/ in test.
2. It sends a dispatch to dogfood-lab/testing-os on main.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs bin/shipcheck.mjs and test/, and publishes to npm.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**repomesh-broadcast** checks package.json, commits into a clone of mcp-tool-shop-org/repomesh and pushes there, and opens a pull request.

**shipcheck** (a command people run) runs bin/shipcheck.mjs.

## What breaks what

- **bin** is imported only from tests, by 1 part (test), and sits on the path of 3 doors.
- **test** is imported by no other part and sits on the path of 2 doors.

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

People write .claude/, .github/, contracts/, docs/, dogfood/, the repository root and templates/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → bin/shipcheck.mjs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 import site could not be resolved.
- 23 reads use paths built at run time and are not named here.
- 1 write and 16 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 3 commands are built at run time and not followed, all of them in tests.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
