# rnd-data: how it works

Mapped at 2026-10-26 from commit 6647b87 by Atlas 1.26.0.

## What this is

The raw data behind the studio's research: every run's receipts and outputs, with a manifest per run (rnd-data-run/v1) that pins each file by SHA-256, plus its MIT read-only Python package under src/. (written by a person)

6 parts, mostly shell (79 files), Python (70), CSS (2), TypeScript (2), Astro (1) and JavaScript (1). Work enters through 4 doors; CI and Release each reach 3 parts, and CI is followed because a pull request goes through it. It publishes to PyPI. It deploys a site to GitHub Pages. People run rnd-data.

## What changed since 2026-10-20 (479d651)

- Release (.github/workflows/release.yml) is a new door. It starts when a release is published; or by hand. It runs src/rnd_data/__init__.py, tests/ and verify.sh. It checks src/.
- README.md is now also read by runs/xrpl-lab-runs--_harness/manifest.json.
- runs/xrpl-lab-runs--_harness/files/ is now read by runs/xrpl-lab-runs--_harness/manifest.json.
- runs/xrpl-lab-runs--_harness/files/* is now read by runs/xrpl-lab-runs--_harness/files/capture_ledger.py.
- And 412 more new writers and readers of places.
- 415 files added and 2 changed content, across 4 parts.

## What comes in

1. **CI.** On a pull request to main; on a push to main touching 13 paths; or by hand. Runs src/rnd_data/cli.py, tests/ and verify.sh; checks src/.
2. **Release.** When a release is published; or by hand. Runs src/rnd_data/__init__.py, tests/ and verify.sh; checks src/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **rnd-data** (a command people run). Runs src/rnd_data/cli.py.

## What happens through CI

1. The workflow runs verify.sh in the repository root, src/rnd_data/cli.py in src and tests/ in tests; it checks src/ in src.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs src/rnd_data/__init__.py, tests/ and verify.sh, checks src/, and publishes to PyPI.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**rnd-data** (a command people run) runs src/rnd_data/cli.py.

## What breaks what

- **src** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.
- **the repository root** is imported by no other part and sits on the path of 2 doors.
- **tests** is imported by no other part and sits on the path of 2 doors.

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

People write .github/, the repository root and site/. The data in runs/ is written by no code this map names; 84 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → src/rnd_data/cli.py → src/rnd_data/__init__.py → src/rnd_data/store.py → src/rnd_data/schema.py

Read those in order to follow one pull request end to end.

## What this map cannot see

- 14 imports could not be resolved: `runs/receipts--colab--rung-prestep-muse-20261019--try5/files/prestep_fit_tokenizer.py` imports `pin_window`, which is no module on its import path and no declared dependency; `runs/receipts--colab--rung-prestep-muse-20261019--try5/files/rung_prestep_muse.py` imports `pin_window`, which is no module on its import path and no declared dependency; `runs/receipts--colab--rung-prestep-muse-20261019/files/derive_allow.py` imports `pin_window`, which is no module on its import path and no declared dependency; and 11 more.
- 84 writes and 143 reads use paths built at run time and are not named here.
- 8 writes and 89 reads go to a path their caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
