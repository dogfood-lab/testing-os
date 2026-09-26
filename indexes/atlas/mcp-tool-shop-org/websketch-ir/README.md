# websketch-ir: how it works

Mapped at 2026-09-26 from commit 6a7f45d by Atlas 1.23.0.

## What this is

6 parts, mostly TypeScript (46 files), CSS (2), JavaScript (2) and Astro (1). Work enters through 4 doors; CI and Release each reach 2 parts, and CI is followed because a pull request goes through it. It publishes to npm. It deploys a site to GitHub Pages. People import @mcptoolshop/websketch-ir.

## What changed since 2026-09-25 (e9980b1)

- CI's push trigger now also names `codecov.yml`.
- 1 file added and 3 changed content, across 2 parts.

## What comes in

1. **CI.** On a pull request to main; on a push to main touching 7 paths; or by hand. Runs tests/codegen.test.ts, tests/compat.test.ts, tests/diff.test.ts and 25 more; builds src/.
2. **Release.** When a tag matching `v*` is pushed; or by hand. Runs tests/codegen.test.ts, tests/compat.test.ts, tests/diff.test.ts and 25 more; builds src/.
3. **Deploy site to GitHub Pages.** On a pull request to main touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **@mcptoolshop/websketch-ir** (the package people import). Loads src/index.ts, src/codegen/index.ts, src/errors.ts and 1 more.

## What happens through CI

1. The workflow runs 28 files in tests; it builds src/ in src.
2. It uploads coverage to Codecov.
3. It scans for secrets with TruffleHog.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs tests/codegen.test.ts, tests/compat.test.ts, tests/diff.test.ts and 25 more, builds src/, publishes to npm, and creates a GitHub release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on a push to main or by hand.

**@mcptoolshop/websketch-ir** (the package people import) loads src/index.ts, src/codegen/index.ts, src/errors.ts and 1 more.

## What breaks what

- **src** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.
- **tests** is imported by no other part and sits on the path of 2 doors.

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

People write .github/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → src/index.ts → src/text.ts → src/errors.ts → src/compat.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 read goes to a path its caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
