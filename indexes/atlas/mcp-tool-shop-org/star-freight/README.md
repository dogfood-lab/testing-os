# star-freight: how it works

Mapped at 2026-09-24 from commit 743f657.

## What this is

8 parts, mostly Python (207 files). Work enters through 5 doors; the busiest is CI, which reaches 2 parts. It publishes to PyPI. People run starfreight.

## What changed since 2026-09-23 (fd07312)

- CI's pull request trigger now also names `atlas/**`.
- CI's push trigger now also names `atlas/**`.
- Publish to PyPI now also checks src/portlight/.
- And 1 more change to a door.
- dogfood/scenarios/ is now also read by tests/test_dogfood_runner.py.
- dogfood/scenarios/gray_seizure_60d_s17.json is now read by tests/test_dogfood_runner.py.
- dogfood/scenarios/recovery_broke_hull_45d_s99.json is now read by tests/test_dogfood_runner.py.
- And 3 more new writers and readers of places.
- 316 files changed content, across 8 parts.

## What comes in

1. **CI.** On a pull request touching 8 paths; on a push touching 8 paths; or by hand. Runs tests/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **Release Binaries.** When a release is published; or by hand. Runs src/portlight/__main__.py.
4. **Publish to PyPI.** When a release is published; or by hand. Checks src/portlight/.
5. **starfreight** (a command people run). Runs src/portlight/app/cli.py.

## What happens through CI

1. The workflow runs tests/ in tests.
2. That reaches src (104 files).

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Release Binaries** runs src/portlight/__main__.py and creates a GitHub release.

**Publish to PyPI** checks src/portlight/ and publishes to PyPI.

**starfreight** (a command people run) runs src/portlight/app/cli.py.

## What breaks what

- **src** is imported by 1 part (dogfood), and by 1 more only from tests; it sits on the path of 4 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **dogfood** is imported by no test.

## Written but never read

- **dogfood/wave1_results.json** is written by dogfood/run_wave1.py and read by nothing else in this repository.
- **dogfood/wave2_results.json** is written by dogfood/run_wave2.py and read by nothing else in this repository.
- **dogfood/wave3_results.json** is written by dogfood/run_wave3.py and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **dogfood/wave1_results.json** is written by dogfood/run_wave1.py.
- **dogfood/wave2_results.json** is written by dogfood/run_wave2.py.
- **dogfood/wave3_results.json** is written by dogfood/run_wave3.py.

## Hand-authored

People write .github/, design/, the repository root, site/ and world/; 5 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → src/portlight/app/cli.py

Read those in order to follow one pull request end to end.

## What this map cannot see

- 2 import sites could not be resolved.
- 5 writes and 2 reads use paths built at run time and are not named here.
- 1 write and 3 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
