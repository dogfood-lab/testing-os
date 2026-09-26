# research-packs: how it works

Mapped at 2026-09-26 from commit 923a792 by Atlas 1.23.0.

## What this is

7 parts, mostly JSON data (1166 files) and Markdown (430); code in HTML (174), JavaScript (8), CSS (2), TypeScript (2) and Astro (1). Work enters through 2 doors; the busiest is Verify, which reaches 2 parts. It deploys a site to GitHub Pages.

## What changed since 2026-09-25 (82aca6d)

Nothing structural changed since 2026-09-25; no file changed.

## What comes in

1. **Verify.** On a pull request to main; on a push to main. Runs scripts/verify-pack.mjs, tests/manifest-schema.test.mjs, tests/summarize-pack.test.mjs and 1 more.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.

## What happens through Verify

1. The workflow runs scripts/verify-pack.mjs in scripts and tests/manifest-schema.test.mjs, tests/summarize-pack.test.mjs and tests/verify-pack.test.mjs in tests.

## Who reads the results

Verify writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

## What breaks what

- **scripts** is imported only from tests, by 1 part (tests), and sits on the path of 1 door.

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

People write .github/, docs/, packages/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/verify.yml → scripts/verify-pack.mjs → scripts/manifest-schema.mjs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 read uses a path built at run time and is not named here.
- 1 write and 9 reads go to a path their caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
