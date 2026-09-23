# mapped-repo: how it works

Mapped at 2026-09-23 from commit 2f87ac2.

## What this is

8 parts, mostly JavaScript (6 files). No workflows were found, so this page has no doors.

## What changed since the last map

This is the first map.

## What breaks what

- **api** is imported by 1 part (cli), and by 1 more only from tests; it sits on the path of no door.
- **core** is imported by 1 part (api), and by 1 more only from tests; it sits on the path of no door.
- **util** is imported by 1 part (core) and sits on the path of no door.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **cli** is imported by no test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write config/, docs/ and the repository root. Nothing in this repository writes to them.

## Where to start

No door was found, so there is no path through this repository to follow.

## What this map cannot see

- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 20 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
