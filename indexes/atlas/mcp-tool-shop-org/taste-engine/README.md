# taste-engine: how it works

Mapped at 2026-10-19 from commit 0d7f414 by Atlas 1.26.0.

## What this is

11 parts, mostly TypeScript (144 files), shell (7), JavaScript (3), CSS (2), Astro (1) and HTML (1). Work enters through 4 doors; CI and Release each reach 2 parts, and CI is followed because a pull request goes through it. It publishes to npm. It deploys a site to GitHub Pages. People run taste.

## What changed since 2026-10-15 (a8298b1)

- Release (.github/workflows/release.yml) is a new door. It starts when a release is published; or by hand. It runs test/. It builds src/.
- package.json is now also read by .github/workflows/release.yml.
- 1 file added and 3 changed content, across 2 parts.

## What comes in

1. **CI.** On a pull request to main; on a push to main touching 12 paths; or by hand. Runs test/; builds src/.
2. **Release.** When a release is published; or by hand. Runs test/; builds src/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **taste** (a command people run). Runs src/cli/index.ts.

## What happens through CI

1. The workflow runs test/ in test; it builds src/ in src.
2. It uploads coverage to Codecov.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs test/, builds src/, and publishes to npm.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**taste** (a command people run) runs src/cli/index.ts.

## What breaks what

- **src** is imported only from tests, by 1 part (test), and sits on the path of 3 doors.
- **test** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, canon/, docs/, migrations/, proving/, the repository root and site/. Nothing in this repository writes to them. The data in .claude/ and samples/ is written by no code this map names.

## Where to start

.github/workflows/ci.yml → src/cli/index.ts → src/cli/commands/init.ts → src/cli/config.ts → src/core/types.ts → src/core/enums.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 7 reads use paths built at run time and are not named here.
- 15 writes and 70 reads go to a path their caller passes, not to this repository.
- 4 writes and 13 reads go to the directory the command is run in or a path their caller passes, not to this repository.
- 1 command is built at run time and not followed.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
