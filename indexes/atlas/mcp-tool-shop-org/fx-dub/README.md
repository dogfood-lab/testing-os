# fx-dub: how it works

Mapped at 2026-09-25 from commit 8bb7ee7.

## What this is

9 parts, mostly Python (22 files), CSS (2), TypeScript (2), Astro (1), JavaScript (1) and shell (1). Work enters through 5 doors; ci and release each reach 3 parts, and ci is followed because a pull request goes through it. It publishes to PyPI. It deploys a site to GitHub Pages. People run fxdub-dialogue and fxdub-receipt.

## What changed since 2026-09-25 (ebdab06)

- tests now imports tools.
- ci now also runs tests/.
- release now also runs tests/.
- fxdub-dialogue (pyproject.toml) is a new command. It runs tools/dialogue_receipt.py.
- And 1 more change to a door.
- kb/fxdub.db is now also written by kb/build_db.py.
- No file changed.

## What comes in

1. **ci.** On a pull request touching 13 paths; on a push to main touching 13 paths; or by hand. Runs verify.sh and tests/.
2. **release.** When a release is published; or by hand. Runs verify.sh and tests/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **fxdub-dialogue** (a command people run). Runs tools/dialogue_receipt.py.
5. **fxdub-receipt** (a command people run). Runs tools/audition_receipt.py.

## What happens through ci

1. The workflow runs verify.sh in the repository root and tests/ in tests.
2. That reaches tools (6 files).
3. It writes to kb/fxdub.db.

## Who reads the results

- **kb/fxdub.db** is read by 2 tests.

## The other doors

**release** runs verify.sh and tests/, reaches tools, writes to kb/fxdub.db, publishes to PyPI, and uploads dist/* and files named at run time to the release on a release event.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**fxdub-dialogue** (a command people run) runs tools/dialogue_receipt.py.

**fxdub-receipt** (a command people run) runs tools/audition_receipt.py.

## What breaks what

- **tools** is imported only from tests, by 1 part (tests), and sits on the path of 4 doors.
- **the repository root** is imported by no other part and sits on the path of 2 doors.
- **tests** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

No two source files, other than a file and its own test, changed together often enough to name.

1 file changed together with its own test, as expected.

Window: 180 days; a pair counts from 3 shared commits, since 1 source file reaches 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **kb** is imported by no test.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **kb/fxdub.db** is written by kb/build_db.py.

## Hand-authored

People write .github/, docs/, the repository root, runs/, site/ and workflows/. Nothing in this repository writes to them.

## Where to start

Start at tools/dialogue_receipt.py to follow one run of fxdub-dialogue end to end. This path follows fxdub-dialogue (a command people run) from its entry, since ci runs only tests.

## What this map cannot see

- 1 import could not be resolved: `tools/dialogue_receipt.py` imports `verify`, which is no module on its import path and no declared dependency.
- 2 writes and 6 reads go to a path their caller passes, not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
