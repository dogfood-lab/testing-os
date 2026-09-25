# .github: how it works

Mapped at 2026-09-25 from commit 8d8d1d2.

## What this is

This is the organization's profile page and the community-health files its repositories inherit. 8 parts, mostly JavaScript (4 files), Python (1) and TypeScript (1). Work enters through 3 doors; the busiest is Org Drift Guard, which reaches 3 parts.

## What changed since 2026-09-25 (f4a5220)

Nothing structural changed since 2026-09-25; no file changed.

## What comes in

1. **Org Drift Guard.** On a pull request touching 8 paths; or by hand. Checks CODE_OF_CONDUCT.md, CONTRIBUTING.md, LICENSE and 10 more.
2. **Docs Quality.** On a pull request touching 3 paths; on a push to main touching 3 paths; or by hand. Runs scripts/check-catalog.mjs.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.

## What happens through Org Drift Guard

1. The workflow checks brand/README.md, brand/og/manifest.json and brand/palette.md in brand, 5 files in docs, and 5 files in the repository root.

## Who reads the results

Org Drift Guard writes nothing this map can see.

## The other doors

**Docs Quality** runs scripts/check-catalog.mjs.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

## What breaks what

No part is imported by another part, and no part sits on the path of two doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

No test files were found by name.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **docs/catalog.yaml** is written by scripts/build-catalog.mjs.

## Hand-authored

People write .github/, assets/, brand/, profile/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/docs-quality.yml → scripts/check-catalog.mjs → docs/catalog.yaml → scripts/build-catalog.mjs

Read those in order to follow one pull request end to end. This path follows Docs Quality, since Org Drift Guard runs no code this map can follow.

## What this map cannot see

- 1 write goes to places this repository does not track, so it is not listed as generated.
- 1 write goes to a temporary directory, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
