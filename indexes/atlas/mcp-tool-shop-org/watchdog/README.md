# watchdog: how it works

Mapped at 2026-11-16 from commit 5492ab8 by Atlas 1.26.0.

## What this is

8 parts, mostly PowerShell (34 files), CSS (2), TypeScript (2), Astro (1) and JavaScript (1). Work enters through 1 door; the busiest is ci, which reaches 1 part.

## What changed since 2026-11-13 (d4953d7)

Nothing structural changed since 2026-11-13; no file changed.

## What comes in

1. **ci.** On a pull request touching 9 paths; on a push touching 9 paths; or by hand. Runs verify.ps1.

## What happens through ci

1. The workflow runs verify.ps1 in the repository root.

## Who reads the results

ci writes nothing this map can see.

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
