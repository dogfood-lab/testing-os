# websketch-ir: how it works

Mapped at 2026-09-25 from commit d18f24a.

## What this is

6 parts, mostly TypeScript (46 files) and JavaScript (2). Work enters through 4 doors; CI and Release each reach 2 parts, and CI is followed because a pull request goes through it. It publishes to npm. People import @mcptoolshop/websketch-ir.

## What changed since 2026-09-25 (e9980b1)

Nothing structural changed since 2026-09-25; 2 files changed content.

## What comes in

1. **CI.** On a pull request; on a push to main touching 6 paths; or by hand. Runs tests/codegen.test.ts, tests/compat.test.ts, tests/diff.test.ts and 25 more; checks src/.
2. **Release.** When a tag matching `v*` is pushed; or by hand. Runs tests/codegen.test.ts, tests/compat.test.ts, tests/diff.test.ts and 25 more; checks src/.
3. **Deploy site to GitHub Pages.** On a pull request touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **@mcptoolshop/websketch-ir** (the package people import). Loads src/index.ts, src/codegen/index.ts, src/errors.ts and 1 more.

## What happens through CI

1. The workflow runs 28 files in tests; it checks src/ in src.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs tests/codegen.test.ts, tests/compat.test.ts, tests/diff.test.ts and 25 more, checks src/, publishes to npm, and creates a GitHub release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on a push to main.

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

src/codegen/index.ts

Read those in order to follow one import of @mcptoolshop/websketch-ir end to end. This path follows @mcptoolshop/websketch-ir (the package people import) from its entry, since CI runs only tests.

## What this map cannot see

- 1 read goes to a path its caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
