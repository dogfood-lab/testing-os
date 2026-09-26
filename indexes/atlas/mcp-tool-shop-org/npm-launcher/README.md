# npm-launcher: how it works

Mapped at 2026-09-26 from commit 07c7132 by Atlas 1.23.0.

## What this is

10 parts, mostly JavaScript (15 files), CSS (2), TypeScript (2), Astro (1) and shell (1). Work enters through 10 doors; the busiest is CI, which reaches 3 parts. It publishes @mcptoolshop/npm-launcher, @mcptoolshop/backpropagate (examples/backpropagate), @mcptoolshop/sovereignty (examples/sovereignty), @mcptoolshop/xrpl-camp (examples/xrpl-camp) and @mcptoolshop/xrpl-lab (examples/xrpl-lab) to npm. It deploys a site to GitHub Pages. People run backpropagate, mcptoolshop-launch, sovereignty, xrpl-camp and xrpl-lab. People import @mcptoolshop/npm-launcher.

## What changed since 2026-09-25 (bb50ee9)

- backpropagate (examples/backpropagate/package.json) is a new command. It runs examples/backpropagate/bin/backpropagate.js.
- sovereignty (examples/sovereignty/package.json) is a new command. It runs examples/sovereignty/bin/sovereignty.js.
- xrpl-camp (examples/xrpl-camp/package.json) is a new command. It runs examples/xrpl-camp/bin/xrpl-camp.js.
- And 1 more change to a door.
- examples/backpropagate/LICENSE is now read by .github/workflows/publish-wrapper.yml.
- examples/backpropagate/README.md is now read by .github/workflows/publish-wrapper.yml.
- examples/backpropagate/package.json is now read by .github/workflows/publish-wrapper.yml.
- And 9 more new writers and readers of places.
- No file changed.

## What comes in

1. **CI.** On a pull request touching 9 paths; on a push touching 9 paths; or by hand. Runs bin/mcptoolshop-launch.js and test/.
2. **Release.** When a tag matching `v*` is pushed; or by hand. Runs test/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **Publish wrapper.** By hand. Runs no file this map can see.
5. **mcptoolshop-launch** (a command people run). Runs bin/mcptoolshop-launch.js.
6. **@mcptoolshop/npm-launcher** (the package people import). Loads src/index.js.
7. **backpropagate** (a command people run). Runs examples/backpropagate/bin/backpropagate.js.
8. **sovereignty** (a command people run). Runs examples/sovereignty/bin/sovereignty.js.
9. **xrpl-camp** (a command people run). Runs examples/xrpl-camp/bin/xrpl-camp.js.
10. **xrpl-lab** (a command people run). Runs examples/xrpl-lab/bin/xrpl-lab.js.

## What happens through CI

1. The workflow runs bin/mcptoolshop-launch.js in bin and test/ in test.
2. That reaches src (8 files).

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs test/, reaches src, publishes to npm, and creates a GitHub release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Publish wrapper** runs no file this map can see and publishes @mcptoolshop/backpropagate (examples/backpropagate), @mcptoolshop/sovereignty (examples/sovereignty), @mcptoolshop/xrpl-camp (examples/xrpl-camp) and @mcptoolshop/xrpl-lab (examples/xrpl-lab) to npm.

**mcptoolshop-launch** (a command people run) runs bin/mcptoolshop-launch.js and reaches src.

**@mcptoolshop/npm-launcher** (the package people import) loads src/index.js.

**backpropagate** (a command people run) runs examples/backpropagate/bin/backpropagate.js.

**sovereignty** (a command people run) runs examples/sovereignty/bin/sovereignty.js.

**xrpl-camp** (a command people run) runs examples/xrpl-camp/bin/xrpl-camp.js.

**xrpl-lab** (a command people run) runs examples/xrpl-lab/bin/xrpl-lab.js.

## What breaks what

- **src** is imported by 1 part (bin), and by 1 more only from tests; it sits on the path of 4 doors.
- **bin** is imported by no other part and sits on the path of 2 doors.
- **test** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **backpropagate** is imported by no test.
- **sovereignty** is imported by no test.
- **xrpl-camp** is imported by no test.
- **xrpl-lab** is imported by no test.

bin is touched by tests only through a spawn: a test runs its files as a child process.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → bin/mcptoolshop-launch.js → src/index.js → src/log.js

Read those in order to follow one pull request end to end.

## What this map cannot see

- 3 reads use paths built at run time and are not named here.
- 4 writes and 5 reads go to a path their caller passes, not to this repository.
- 3 writes and 5 reads go to the home directory (.local/ and backpropagate/) or a path their caller passes, not to this repository.
- 3 commands are built at run time and not followed.
- 1 file belongs to no part: examples/ci/release-binaries.yml.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
