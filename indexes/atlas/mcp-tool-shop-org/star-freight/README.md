# star-freight: how it works

Mapped at 2026-09-25 from commit 743f657.

## What this is

8 parts, mostly Python (207 files), TypeScript (2) and JavaScript (1). Work enters through 5 doors; the busiest is CI, which reaches 2 parts. It publishes to PyPI. People run starfreight.

## What changed since 2026-09-23 (fd07312)

- CI's pull request trigger now also names `atlas/**`.
- CI's push trigger now also names `atlas/**`.
- Publish to PyPI now also checks src/portlight/.
- And 1 more change to a door.
- README.md is now read by pyproject.toml.
- dogfood/scenarios/ is now also read by tests/test_dogfood_runner.py.
- dogfood/scenarios/gray_seizure_60d_s17.json is now read by tests/test_dogfood_runner.py.
- And 5 more new writers and readers of places.
- 316 files changed content, across 8 parts.

## What comes in

1. **CI.** On a pull request touching 8 paths; on a push touching 8 paths; or by hand. Runs tests/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **Release Binaries.** When a release is published; or by hand. Builds src/portlight/__main__.py.
4. **Publish to PyPI.** When a release is published; or by hand. Checks src/portlight/.
5. **starfreight** (a command people run). Runs src/portlight/app/cli.py.

## What happens through CI

1. The workflow runs tests/ in tests.
2. That reaches src (104 files).

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Release Binaries** builds src/portlight/__main__.py into binaries for darwin-arm64, linux-x64 and win-x64 and uploads them to the release.

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

src/portlight/app/cli.py → src/portlight/app/session.py → src/portlight/engine/encounter.py → src/portlight/engine/captain_memory.py → src/portlight/engine/underworld.py → src/portlight/engine/weapon_provenance.py → src/portlight/engine/loot.py

Read those in order to follow one run of starfreight end to end. This path follows starfreight (a command people run) from its entry, since CI runs only tests.

## What this map cannot see

- 2 imports could not be resolved: `src/portlight/app/tui/screens/encounter.py` imports `portlight.content.weapons`, which is no module on its import path and no declared dependency; `src/portlight/app/tui/screens/encounter.py` imports `portlight.content.weapons`, which is no module on its import path and no declared dependency.
- 5 writes and 2 reads use paths built at run time and are not named here.
- 1 write and 3 reads go to the directory the command is run in, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
