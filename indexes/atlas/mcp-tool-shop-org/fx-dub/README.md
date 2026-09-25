# fx-dub: how it works

Mapped at 2026-09-25 from commit 8bb7ee7.

## What this is

9 parts, mostly Python (22 files), TypeScript (2) and JavaScript (1). Work enters through 3 doors; ci, Deploy site to GitHub Pages and release each reach 1 part, and ci is followed because a pull request goes through it. It publishes to PyPI.

## What changed since 2026-09-25 (ebdab06)

Nothing structural changed since 2026-09-25; no file changed.

## What comes in

1. **ci.** On a pull request touching 13 paths; on a push to main touching 13 paths; or by hand. Runs verify.sh.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **release.** When a release is published; or by hand. Runs verify.sh.

## What happens through ci

1. The workflow runs verify.sh in the repository root.

## Who reads the results

ci writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**release** runs verify.sh, publishes to PyPI, and uploads dist/* and files named at run time to the release on a release event.

## What breaks what

- **the repository root** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

No two source files, other than a file and its own test, changed together often enough to name.

1 file changed together with its own test, as expected.

Window: 180 days; a pair counts from 3 shared commits, since 1 source file reaches 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **kb** is imported by no test.

12 test files run in no workflow: tests/test_api_detectors.py, tests/test_assets.py, tests/test_audition_receipt.py and 9 mores.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **kb/fxdub.db** has a block written by tests/test_kb.py (a test).

## Hand-authored

People write .github/, docs/, the repository root, runs/, site/ and workflows/. Nothing in this repository writes to them.

## Where to start

ci runs no code this map can follow, so there is no path of files to read in order.

## What this map cannot see

- 17 imports could not be resolved: `tests/test_api_detectors.py` imports `graph_lint`, which is no module on its import path and no declared dependency; `tests/test_audition_receipt.py` imports `audition_receipt`, which is no module on its import path and no declared dependency; `tests/test_audition_receipt.py` imports `flac_info`, which is no module on its import path and no declared dependency; and 14 more.
- 4 reads use paths built at run time and are not named here.
- 2 writes and 2 reads go to a path their caller passes, not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
