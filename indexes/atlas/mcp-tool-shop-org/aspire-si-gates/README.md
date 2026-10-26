# aspire-si-gates: how it works

Mapped at 2026-10-26 from commit 8ed78f2 by Atlas 1.26.0.

## What this is

0 parts, mostly Python (12 files). Work enters through 2 doors, and none of them runs a file this map can see.

## What changed since 2026-10-24 (430862b)

- src/aspire_si_gates/*.py is now read by src/aspire_si_gates/__init__.py.
- No file changed.

## What comes in

1. **ci.** On a pull request; on a push to main touching 5 paths; or by hand. Runs tests/test_apply_item.py, tests/test_closed_form.py, tests/test_material_and_puzzles.py and 2 more.
2. **aspire_si_gates** (the package's entry, not published from here). Loads src/aspire_si_gates/__init__.py.

## What breaks what

No part is imported by another part, and no part sits on the path of two doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

No part outside the tests holds code this map reads.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

No configuration or documentation part is left to people alone.

## Where to start

No door runs a file this map can see, so there is no path through this repository to follow.

## What this map cannot see

- 24 files belong to no part: .gitattributes, .github/workflows/ci.yml, .gitignore and 21 more.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
