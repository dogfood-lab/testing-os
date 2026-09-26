# knowledge-core: how it works

Mapped at 2026-09-26 from commit f7dfb2e by Atlas 1.23.0.

## What this is

6 parts, mostly TypeScript (17 files), CSS (2), Astro (1) and JavaScript (1). Work enters through 3 doors; the busiest is CI, which reaches 2 parts. It deploys a site to GitHub Pages.

## What changed since 2026-09-23 (274af45)

- CI's pull request trigger now also names `atlas/**`.
- CI's push trigger now also names `atlas/**`.
- knowledge/corpus/fixtures/corpus-divergence.json is now read by test/pipeline.test.ts.
- knowledge/roles/ is now read by test/contracts.test.ts and test/pipeline.test.ts.
- knowledge/roles/competitive-analyst.json is now read by test/pipeline.test.ts.
- And 6 more new writers and readers of places.
- 56 files changed content, across 6 parts.

## What comes in

1. **CI.** On a pull request touching 9 paths; on a push touching 9 paths; or by hand. Runs test/; checks src/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **@roleos/knowledge-core** (the package's entry, not published from here). Loads src/index.ts.

## What happens through CI

1. The workflow runs test/ in test; it checks src/ in src.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**@roleos/knowledge-core** (the package's entry, not published from here) loads src/index.ts.

## What breaks what

- **src** is imported only from tests, by 1 part (test), and sits on the path of 2 doors.

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

People write .github/, knowledge/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

src/index.ts → src/validate.ts → src/types.ts

Read those in order to follow one import of @roleos/knowledge-core end to end. This path follows @roleos/knowledge-core (the package's entry, not published from here) from its entry, since CI runs only tests and checks.

## What this map cannot see

- 6 reads go to a path their caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
