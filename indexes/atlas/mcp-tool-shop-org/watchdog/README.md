# watchdog: how it works

Mapped at 2026-11-09 from commit 770462b by Atlas 1.26.0.

## What this is

8 parts, mostly PowerShell (34 files), CSS (2), TypeScript (2), Astro (1) and JavaScript (1). Work enters through 2 doors; ci and Deploy site to GitHub Pages each reach 1 part, and ci is followed because a pull request goes through it. It deploys a site to GitHub Pages.

## What changed since 2026-10-15 (c777acc)

Nothing structural changed since 2026-10-15; 2 files changed content.

## What comes in

1. **ci.** On a pull request touching 9 paths; on a push touching 9 paths; or by hand. Runs verify.ps1.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.

## What happens through ci

1. The workflow runs verify.ps1 in the repository root.

## Who reads the results

ci writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

## What breaks what

No part is imported by another part, and no part sits on the path of two doors.

origin and src hold only PowerShell files, which this map does not read, so what uses them cannot be seen.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

origin and src hold only PowerShell files, which this map does not read, so whether a test touches them cannot be seen.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .claude/, .github/, docs/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

ci runs no code this map can follow, so there is no path of files to read in order.

## What this map cannot see

- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
