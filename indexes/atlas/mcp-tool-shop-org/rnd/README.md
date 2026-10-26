# rnd: how it works

Mapped at 2026-10-26 from commit 9b57e18 by Atlas 1.26.0.

## What this is

The studio research bench: Markdown entries with tiered sources and checked claims, rig experiments, an instrument registry and rated catalogues, indexed and searched by the rnd CLI (Python, standard library only). (written by a person)

14 parts, mostly Python (148 files), shell (30), TypeScript (3), Astro (2), CSS (2), HTML (2), JavaScript (1) and PowerShell (1). Work enters through 5 doors; the busiest is CI, which reaches 6 parts. It publishes to npm and PyPI. It deploys a site to GitHub Pages. People run rnd.

## What changed since 2026-10-25 (50b42f1)

- experiments/colab-golden-path/data/windows/window*/gate.jsonl is now read by experiments/colab-golden-path/figures.py.
- experiments/verifier-gold/calibration/results/2026-10-09-chain/cal-*-tune/metrics.json is now read by experiments/charts/make_charts.py.
- site/public/charts/*.svg is now read by site/scripts/check_feed.py and site/scripts/render_chart_pngs.py.
- And 1 more new writer or reader of a place.
- entries was generated and is now mixed.
- site/scripts/check_feed.py now starts at `main`; it started at `chart_errors`.
- 1 file added and 8 changed content, across 5 parts.

## What comes in

1. **CI.** On a pull request to main; on a push to main touching 15 paths; or by hand. Runs site/scripts/check_feed.py, site/scripts/newsletter_publish.py, verify.sh and 29 more; checks mcptoolshop_rnd/.
2. **Release.** When a release is published; or by hand. Runs mcptoolshop_rnd/__init__.py and verify.sh; checks mcptoolshop_rnd/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/scripts/check_feed.py, site/astro.config.mjs and site/src/.
4. **Publish the newsletter.** When the workflow Deploy site to GitHub Pages completes; or by hand. Runs site/scripts/newsletter_publish.py.
5. **rnd** (a command people run). Runs mcptoolshop_rnd/cli.py.

## What happens through CI

1. The workflow runs verify.sh in the repository root, site/scripts/check_feed.py and site/scripts/newsletter_publish.py in site, and tests/ in tests; it checks mcptoolshop_rnd/ in mcptoolshop_rnd.
2. That reaches experiments (7 files) and rnd (1 file).
3. It writes to entries/, experiments/charts/, instruments/ and site/public/charts/.
4. It uploads coverage to Codecov.

## Who reads the results

- **entries/** is read by experiments/embeddinggemma-2/harness/build_corpus.py, and by 2 tests.
- **experiments/charts/** has no reader in this repository.
- **instruments/** is read by experiments/embeddinggemma-2/harness/build_corpus.py.
- **site/public/charts/** is read by site/scripts/check_feed.py and site/src/pages/newsletter/rss.xml.ts.

## The other doors

**Release** runs mcptoolshop_rnd/__init__.py and verify.sh, checks mcptoolshop_rnd/, and publishes to PyPI.

**Deploy site to GitHub Pages** runs site/scripts/check_feed.py, site/astro.config.mjs and site/src/, and deploys the site.

**Publish the newsletter** runs site/scripts/newsletter_publish.py and publishes to npm and PyPI.

**rnd** (a command people run) runs mcptoolshop_rnd/cli.py and writes to entries/ and instruments/.

## What breaks what

- **mcptoolshop_rnd** is imported by 2 parts (experiments, rnd), and by 1 more only from tests; it sits on the path of 3 doors.
- **site** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.
- **the repository root** is imported by no other part and sits on the path of 2 doors.
- **experiments** is imported only from tests, by 1 part (tests), and sits on the path of 1 door.
- **rnd** is imported only from tests, by 1 part (tests), and sits on the path of 1 door.
- **experiments/natural-errors/data/** is written by experiments and read by experiments; a hand edit reaches every reader.
- **entries/** holds files written by mcptoolshop_rnd and read by experiments and mcptoolshop_rnd, and by 2 tests; a hand edit reaches every reader.

the repository root holds only shell files, which this map does not read, so what uses it cannot be seen.

## What tends to change together

- **experiments/atlas-mcp-utility/run.py** and **tests/test_atlas_mcp_utility_run.py** changed together in 15 of 15 commits.
- **mcptoolshop_rnd/layout.py** and **mcptoolshop_rnd/runs.py** changed together in 4 of 7 commits, inside the mcptoolshop_rnd part.
- **mcptoolshop_rnd/layout.py** and **tests/test_runs.py** changed together in 4 of 7 commits, and the tests part imports the mcptoolshop_rnd part.
- **mcptoolshop_rnd/localbuilders/proxy.py** and **tests/test_localbuilders.py** changed together in 4 of 7 commits, and the tests part imports the mcptoolshop_rnd part.
- **rnd/cli.py** and **tests/test_rnd.py** changed together in 4 of 8 commits.

2 files changed together with their own tests, as expected.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 5 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part this map reads is imported by at least one test.

the repository root holds only shell files, which this map does not read, so whether a test touches it cannot be seen.

5 test files run in no workflow: experiments/cuda-graphs/test_graphed_heads.py, experiments/data-designer/tests/test_lockdown.py, experiments/interlock-relay/stage1/test_analyze.py and 2 more.

## Written but never read

- **experiments/charts/** holds files written by experiments/charts/make_charts.py and read by nothing else this map can name: experiments/embeddinggemma-2/harness/score.py and mcptoolshop_rnd/store.py read `*.json` under a directory chosen at run time, which may include it.
- **experiments/colab-golden-path/figures.json** is written by experiments/colab-golden-path/figures.py and read by nothing else this map can name: experiments/embeddinggemma-2/harness/score.py and mcptoolshop_rnd/store.py read `*.json` under a directory chosen at run time, which may include it.
- **experiments/natural-errors/data/baselines_p1.json** is written by experiments/natural-errors/baselines_p1.py and read by nothing else this map can name: experiments/embeddinggemma-2/harness/score.py and mcptoolshop_rnd/store.py read `*.json` under a directory chosen at run time, which may include it.
- **experiments/natural-errors/data/corrections.json** is written by experiments/natural-errors/build_corrections.py and read by nothing else this map can name: experiments/embeddinggemma-2/harness/score.py and mcptoolshop_rnd/store.py read `*.json` under a directory chosen at run time, which may include it.
- **experiments/ollama-cuda-backend/** holds files written by experiments/ollama-cuda-backend/diag_test-v4-draft.py and read by nothing else this map can name: experiments/embeddinggemma-2/harness/check_grades.py, experiments/embeddinggemma-2/harness/grading.py, experiments/embeddinggemma-2/harness/score.py and 1 more file read `*.json` and `*.jsonl` under a directory chosen at run time, which may include it.
- **experiments/verifier-gold/crossfamily/** holds files written by experiments/verifier-gold/crossfamily/run_labeller.py and read by nothing else this map can name: experiments/embeddinggemma-2/harness/check_grades.py, experiments/embeddinggemma-2/harness/grading.py, experiments/embeddinggemma-2/harness/score.py and 1 more file read `*.json` and `*.jsonl` under a directory chosen at run time, which may include it.
- **experiments/verifier-gold/crossfamily/blind_key.json** is written by experiments/verifier-gold/crossfamily/make_sample.py and read by nothing else this map can name: experiments/embeddinggemma-2/harness/score.py and mcptoolshop_rnd/store.py read `*.json` under a directory chosen at run time, which may include it.
- **experiments/verifier-gold/crossfamily/sample.jsonl** is written by experiments/verifier-gold/crossfamily/make_sample.py and read by nothing else this map can name: experiments/embeddinggemma-2/harness/check_grades.py and experiments/embeddinggemma-2/harness/grading.py read `*.jsonl` under a directory chosen at run time, which may include it.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **main** is exported by experiments/npu-probe/probe.py (experiments) and mcptoolshop_rnd/localbuilders/probe.py (mcptoolshop_rnd); the two look alike.

## Generated, never hand-edited

- **entries/** holds files written by mcptoolshop_rnd/cli.py, except entries/_template.md, which it reads and people write.
- **experiments/charts/** holds files written by experiments/charts/make_charts.py.
- **experiments/colab-golden-path/figures.json** is written by experiments/colab-golden-path/figures.py.
- **experiments/e4b/results/** is written by experiments/e4b/extract.py.
- **experiments/kev-judge-finetune/results/summary.json** is written by experiments/kev-judge-finetune/summarise.py.
- **experiments/natural-errors/data/** is written by experiments/natural-errors/build.py, except experiments/natural-errors/data/answers.json, experiments/natural-errors/data/questions.json, experiments/natural-errors/data/screen.json, experiments/natural-errors/data/screen_ctx_pilot.json, experiments/natural-errors/data/screen_extra.json and experiments/natural-errors/data/selection.json, which it reads and people write.
- **experiments/natural-errors/data/baselines_p1.json** is written by experiments/natural-errors/baselines_p1.py.
- **experiments/natural-errors/data/corrections.json** is written by experiments/natural-errors/build_corrections.py.
- **experiments/natural-errors/data/split.json** is written once by experiments/natural-errors/make_split.py when absent.
- **experiments/ollama-cuda-backend/** holds files written by experiments/ollama-cuda-backend/diag_test-v4-draft.py, except experiments/ollama-cuda-backend/diag_test-v4-draft.py, which it reads and people write.
- **experiments/ollama-cuda-backend/diag/** holds files written by experiments/ollama-cuda-backend/diag/diag_test.py (a test), except experiments/ollama-cuda-backend/diag/diag_test.FROZEN.sha256 and experiments/ollama-cuda-backend/diag/diag_test.py, which it reads and people write.
- **experiments/verifier-gold/crossfamily/** holds files written by experiments/verifier-gold/crossfamily/run_labeller.py.
- **experiments/verifier-gold/crossfamily/blind_in.json** is written by experiments/verifier-gold/crossfamily/make_sample.py.
- **experiments/verifier-gold/crossfamily/blind_key.json** is written by experiments/verifier-gold/crossfamily/make_sample.py.
- **experiments/verifier-gold/crossfamily/sample.jsonl** is written by experiments/verifier-gold/crossfamily/make_sample.py.
- **instruments/** is written by mcptoolshop_rnd/cli.py.
- **licences/registry.json** has a block written by licences/snapshot.py.
- **site/public/charts/** is written by experiments/charts/make_charts.py.
- **site/public/charts/png-manifest.json** has a block written by site/scripts/render_chart_pngs.py.

## Hand-authored

People write .claude/, .github/ and docs/. The data in catalogs/ and datapacks/ is written by no code this map names; 24 writes with paths built at run time may land here.

## Where to start

mcptoolshop_rnd/cli.py → entries/ → experiments/embeddinggemma-2/harness/build_corpus.py

Read those in order to follow one run of rnd end to end. This path follows rnd (a command people run) from its entry, since CI runs only tests, scripts that import no code here and checks.

## What this map cannot see

- 12 imports could not be resolved: `experiments/data-designer/tests/test_lockdown.py` imports `egress`, which is no module on its import path and no declared dependency; `experiments/data-designer/tests/test_lockdown.py` imports `studio_lock`, which is no module on its import path and no declared dependency; `experiments/distill-ladder/make_ladder_v2.py` imports a path built at run time; and 9 more.
- 24 writes and 36 reads use paths built at run time and are not named here.
- 7 writes go to places this repository does not track, so they are not listed as generated.
- 58 writes and 141 reads go to a path their caller passes, not to this repository.
- 12 reads go to the directory the command is run in (README.md, SECURITY.md, entries and 3 more places), not to this repository.
- 2 reads go to the directory the command is run in or a path their caller passes, not to this repository.
- 2 reads go to the home directory (.claude/), not to this repository.
- 4 files belong to no part: scripts/colab/collect_windows.py, scripts/colab/probe.py, scripts/colab/rates.sh and 1 more.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
