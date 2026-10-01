# readouts: how it works

Mapped at 2026-10-01 from commit 7bb43b0 by Atlas 1.26.0.

## What this is

20 parts, mostly Python (161 files), HTML (57), Rust (6), JavaScript (3), CSS (2), TypeScript (2) and Astro (1). Work enters through 2 doors; verify and Deploy site to GitHub Pages each reach 2 parts, and verify is followed because a pull request goes through it. It deploys a site to GitHub Pages.

## What changed since 2026-10-01 (85e5452)

- rust-knowledge/catalog/engine-*.md is now written by rust-knowledge/scripts/gen_catalog.py.
- tensor-engine-knowledge/verifier/results-real-*.json is now written by tensor-engine-knowledge/verifier/citation_panel_eval.py and tensor-engine-knowledge/verifier/citation_panel_eval_3family.py.
- xrpl-knowledge/catalog/track-*.md is now written by xrpl-knowledge/scripts/gen_catalog.py.
- And 83 more new writers and readers of places.
- No file changed.

## What comes in

1. **verify.** On a pull request touching 6 paths; on a push to main touching 6 paths; or by hand. Runs verify.py.
2. **Deploy site to GitHub Pages.** On a push to main touching 3 paths; or by hand. Runs site/astro.config.mjs and site/src/.

## What happens through verify

1. The workflow runs verify.py in the repository root.
2. That reaches shared (1 file).

## Who reads the results

verify writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, reaches the repository root, and deploys the site.

## What breaks what

- **shared** is imported by 6 parts (blender-knowledge, godot-knowledge, the repository root, rust-knowledge, sprite-motion-knowledge, sprites-knowledge) and sits on the path of 1 door.
- **the repository root** is imported by 1 part (the site) and sits on the path of 2 doors.
- **index.html** is written by shared and read by model-knowledge, tensor-engine-knowledge, training-knowledge and xrpl-knowledge; a hand edit reaches every reader.
- **.claude/loadout/index.json** is written by shared and read by blender-knowledge, godot-knowledge, model-knowledge, the repository root, rust-knowledge, shared, sprite-motion-knowledge, sprites-knowledge, tensor-engine-knowledge, training-knowledge and xrpl-knowledge; a hand edit reaches every reader.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **oracle** is imported by no test.
- **oracle-jam** is imported by no test.
- **oracle-jam-strict** is imported by no test.
- **shared** is imported by no test.
- **tensor-engine-knowledge** is imported by no test.

tensor-engine-knowledge/baselines/_triton_test.py runs in no workflow.

## Written but never read

- **model-knowledge/workflows/** holds files written by model-knowledge/scripts/fetch_workflows.py and read by nothing else in this repository.
- **tensor-engine-knowledge/baselines/chroma-results.json** is written by tensor-engine-knowledge/baselines/_chroma_bench.py and read by nothing else in this repository.
- **tensor-engine-knowledge/baselines/qwenimg-results.json** is written by tensor-engine-knowledge/baselines/_qwenimg_bench.py and read by nothing else in this repository.
- **tensor-engine-knowledge/baselines/qwenimg-sa-results.json** is written by tensor-engine-knowledge/baselines/_qwenimg_sa.py and read by nothing else in this repository.
- **tensor-engine-knowledge/baselines/sage-results.json** is written by tensor-engine-knowledge/baselines/_sage_bench.py and read by nothing else in this repository.
- **tensor-engine-knowledge/baselines/sage2-res-results.json** is written by tensor-engine-knowledge/baselines/_sage2_res.py and read by nothing else in this repository.
- **tensor-engine-knowledge/baselines/sage2-results.json** is written by tensor-engine-knowledge/baselines/_sage2_bench.py and read by nothing else in this repository.
- **tensor-engine-knowledge/baselines/sage2-zimage-results.json** is written by tensor-engine-knowledge/baselines/_sage2_zimage.py and read by nothing else in this repository.

And 14 more places.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **already_done** is exported by sprite-motion-knowledge/scripts/verify_cloud.py (sprite-motion-knowledge) and xrpl-knowledge/scripts/verify_cloud.py (xrpl-knowledge); the two look alike.
- **b** is exported by 5 parts (blender-knowledge, godot-knowledge, sprite-motion-knowledge, sprites-knowledge and training-knowledge); with the same name in this many parts it is most likely a shared contract, not a copy.
- **call_model** is exported by 3 parts (blender-knowledge, sprite-motion-knowledge and xrpl-knowledge); with the same name in this many parts it is most likely a shared contract, not a copy.
- **cell** is exported by 11 parts (blender-knowledge, docker-knowledge, godot-knowledge, model-knowledge, rust-knowledge and 6 more); with the same name in this many parts it is most likely a shared contract, not a copy.
- **est** is exported by 11 parts (blender-knowledge, docker-knowledge, godot-knowledge, model-knowledge, rust-knowledge and 6 more); with the same name in this many parts it is most likely a shared contract, not a copy.

And 15 more candidates.

## Generated, never hand-edited

- **.claude/** is written by shared/gen_root_loadout.py.
- **README.md** has a block written by shared/sync_readme_table.py.
- **blender-knowledge/.claude/loadout/index.json** is written by blender-knowledge/scripts/gen_loadout.py.
- **blender-knowledge/blender.db** is written by blender-knowledge (4 files).
- **blender-knowledge/catalog/** is written by blender-knowledge/scripts/gen_catalog.py.
- **blender-knowledge/waves/wave-01-pipeline-core/research-raw.json** has a block written by blender-knowledge/scripts/verify_cloud.py.
- **docker-knowledge/.claude/loadout/index.json** is written by docker-knowledge/scripts/gen_loadout.py.
- **docker-knowledge/catalog/** is written by docker-knowledge/scripts/gen_catalog.py.
- **docker-knowledge/findings.db** is written by docker-knowledge (4 files).
- **docker-knowledge/waves/wave-03-pinned-memory/family-verdicts.json** is written by docker-knowledge/waves/wave-03-pinned-memory/_family_verify.py.
- **docker-knowledge/waves/wave-03-pinned-memory/research-raw.json** is written by docker-knowledge/waves/wave-03-pinned-memory/_build_raw.py.
- **godot-knowledge/.claude/loadout/index.json** is written by godot-knowledge/scripts/gen_loadout.py.
- **godot-knowledge/catalog/** is written by godot-knowledge/scripts/gen_catalog.py.
- **godot-knowledge/godot.db** is written by godot-knowledge (4 files).
- **index.html** is written by shared/gen_root_index.py.
- **index.json** is written by shared/gen_root_index.py.
- **index.md** is written by shared/gen_root_index.py.
- **model-knowledge/.claude/loadout/index.json** is written by model-knowledge/scripts/gen_loadout.py.
- **model-knowledge/catalog/** is written by model-knowledge/scripts/gen_catalog.py.
- **model-knowledge/models.db** is written by model-knowledge (5 files).
- **model-knowledge/workflows/** holds files written by model-knowledge/scripts/fetch_workflows.py.
- **rust-knowledge/.claude/loadout/index.json** is written by rust-knowledge/scripts/gen_loadout.py.
- **rust-knowledge/catalog/** is written by rust-knowledge/scripts/gen_catalog.py.
- **rust-knowledge/rust.db** is written by rust-knowledge (5 files).
- **rust-knowledge/verification/** holds files written by rust-knowledge/scripts/assemble_lanes.py.
- **rust-knowledge/verification/verdicts.json** has a block written by rust-knowledge/scripts/build_ledger.py.
- **rust-knowledge/waves/** holds files written by rust-knowledge/scripts/assemble_lanes.py.
- **sprite-motion-knowledge/.claude/loadout/index.json** is written by sprite-motion-knowledge/scripts/gen_loadout.py.
- **sprite-motion-knowledge/catalog/** is written by sprite-motion-knowledge/scripts/gen_catalog.py.
- **sprite-motion-knowledge/recipes.db** is written by sprite-motion-knowledge (4 files).
- **sprite-motion-knowledge/waves/wave-01-foundation/research-raw.json** has a block written by sprite-motion-knowledge/scripts/verify_cloud.py.
- **sprites-knowledge/.claude/loadout/index.json** is written by sprites-knowledge/scripts/gen_loadout.py.
- **sprites-knowledge/catalog/** is written by sprites-knowledge/scripts/gen_catalog.py.
- **sprites-knowledge/recipes.db** is written by sprites-knowledge (4 files).
- **tensor-engine-knowledge/.claude/loadout/index.json** is written by tensor-engine-knowledge/scripts/gen_loadout.py.
- **tensor-engine-knowledge/baselines/chroma-results.json** is written by tensor-engine-knowledge/baselines/_chroma_bench.py.
- **tensor-engine-knowledge/baselines/diff-results.json** is written by tensor-engine-knowledge/baselines/_diff_bench.py.
- **tensor-engine-knowledge/baselines/qwenimg-results.json** is written by tensor-engine-knowledge/baselines/_qwenimg_bench.py.
- **tensor-engine-knowledge/baselines/qwenimg-sa-results.json** is written by tensor-engine-knowledge/baselines/_qwenimg_sa.py.
- **tensor-engine-knowledge/baselines/sage-results.json** is written by tensor-engine-knowledge/baselines/_sage_bench.py.
- **tensor-engine-knowledge/baselines/sage2-res-results.json** is written by tensor-engine-knowledge/baselines/_sage2_res.py.
- **tensor-engine-knowledge/baselines/sage2-results.json** is written by tensor-engine-knowledge/baselines/_sage2_bench.py.
- **tensor-engine-knowledge/baselines/sage2-zimage-results.json** is written by tensor-engine-knowledge/baselines/_sage2_zimage.py.
- **tensor-engine-knowledge/catalog/** is written by tensor-engine-knowledge/scripts/gen_catalog.py.
- **tensor-engine-knowledge/engines.db** is written by tensor-engine-knowledge (16 files).
- **tensor-engine-knowledge/recipes/MISSING-ENGINE-RECIPES.md** is written by tensor-engine-knowledge/recipes/_gen_backlog.py.
- **tensor-engine-knowledge/verifier/abstracts-cache-multidomain.json** is written by tensor-engine-knowledge/verifier/_wave13_fetch.py.
- **tensor-engine-knowledge/verifier/abstracts-cache.json** is written by tensor-engine-knowledge/verifier/fetch_abstracts.py.
- **tensor-engine-knowledge/verifier/budget-results.json** is written by tensor-engine-knowledge/verifier/budget_bench.py.
- **tensor-engine-knowledge/verifier/citation-panel-3family-receipt.json** is written by tensor-engine-knowledge/verifier/citation_panel_eval_3family.py.
- **tensor-engine-knowledge/verifier/citation-panel-hard-receipt.json** is written by tensor-engine-knowledge/verifier/citation_panel_eval_hard.py.
- **tensor-engine-knowledge/verifier/citation-panel-multidomain-receipt.json** is written by tensor-engine-knowledge/verifier/citation_panel_eval_multidomain.py.
- **tensor-engine-knowledge/verifier/citation-panel-nli-receipt.json** is written by tensor-engine-knowledge/verifier/citation_panel_eval_nli.py.
- **tensor-engine-knowledge/verifier/citation-panel-numeric-receipt.json** is written by tensor-engine-knowledge/verifier/citation_panel_eval_numeric.py.
- **tensor-engine-knowledge/verifier/citation-panel-prompt-v2-receipt.json** is written by tensor-engine-knowledge/verifier/citation_panel_eval_prompt_v2.py.
- **tensor-engine-knowledge/verifier/citation-panel-receipt.json** is written by tensor-engine-knowledge/verifier/citation_panel_eval.py.
- **tensor-engine-knowledge/verifier/e2e-full-abstract-receipt.json** is written by tensor-engine-knowledge/verifier/e2e_full_abstract.mjs.
- **tensor-engine-knowledge/verifier/prompt-hardening-receipt.json** is written by tensor-engine-knowledge/verifier/prompt_hardening_probe.py.
- **tensor-engine-knowledge/verifier/results-qwen3-30b-a3b.json** is written by tensor-engine-knowledge/verifier/verify_local.py.
- **tensor-engine-knowledge/verifier/results-real-*.json** is written by tensor-engine-knowledge/verifier/citation_panel_eval.py and tensor-engine-knowledge/verifier/citation_panel_eval_3family.py.
- **tensor-engine-knowledge/verifier/variant-results.json** is written by tensor-engine-knowledge/verifier/prompt_variant_bench.py.
- **tensor-engine-knowledge/verifier/wave9-abstracts-cache.json** is written by tensor-engine-knowledge/verifier/wave9_dogfood.py.
- **tensor-engine-knowledge/verifier/wave9-dogfood-receipt.json** is written by tensor-engine-knowledge/verifier/wave9_dogfood.py.
- **training-knowledge/.claude/loadout/index.json** is written by training-knowledge/scripts/gen_loadout.py.
- **training-knowledge/catalog/** is written by training-knowledge/scripts/gen_catalog.py.
- **training-knowledge/curriculum.json** is written by training-knowledge/scripts/gen_curriculum.py.
- **training-knowledge/training.db** is written by training-knowledge (7 files).
- **vocology-knowledge/.claude/loadout/index.json** is written by vocology-knowledge/scripts/gen_loadout.py.
- **vocology-knowledge/catalog/** is written by vocology-knowledge/scripts/gen_catalog.py.
- **vocology-knowledge/findings.db** is written by vocology-knowledge (4 files).
- **xrpl-knowledge/.claude/loadout/index.json** is written by xrpl-knowledge/scripts/gen_loadout.py.
- **xrpl-knowledge/catalog/** is written by xrpl-knowledge/scripts/gen_catalog.py.
- **xrpl-knowledge/module-drafts/** is written by xrpl-knowledge/scripts/gen_module_drafts.py.
- **xrpl-knowledge/module-drafts/COVERAGE-GAP.md** is written by xrpl-knowledge/scripts/gen_coverage_gap.py.
- **xrpl-knowledge/waves/wave-01-foundation/research-raw.json** is written by xrpl-knowledge/scripts/assemble_lanes.py and xrpl-knowledge/scripts/verify_cloud.py.
- **xrpl-knowledge/xrpl.db** is written by xrpl-knowledge (7 files).

## Hand-authored

People write .github/, docs/ and site/; 31 writes with paths built at run time may land here.

- **docker-knowledge/waves/wave-02-measurement/research-raw.json** is written by docker-knowledge/waves/wave-02-measurement/_build_raw.py from inputs this repository does not keep, and by people.
- **rust-knowledge/waves/wave-04-si-jam-sessions/** holds files written by rust-knowledge/scripts/openrouter_lane.py from inputs this repository does not keep, and by people.

## Where to start

.github/workflows/verify.yml → verify.py → shared/verdicts.py

Read those in order to follow one pull request end to end.

## What this map cannot see

- 16 imports could not be resolved: `rust-knowledge/waves/wave-03-si-rpg-engine/probes/globals_probe.rs` imports `wasmparser::ExternalKind`; `rust-knowledge/waves/wave-03-si-rpg-engine/probes/globals_probe.rs` imports `wasmparser::Operator`; `rust-knowledge/waves/wave-03-si-rpg-engine/probes/globals_probe.rs` imports `wasmparser::Parser`; and 13 more.
- 1 import site names a path outside this repository, so what it loads is not followed.
- 31 writes and 22 reads use paths built at run time and are not named here.
- 10 writes go to places this repository does not track, so they are not listed as generated.
- 23 writes and 60 reads go to a path their caller passes, not to this repository.
- 6 writes and 2 reads go to a temporary directory, not to this repository.
- 5 reads go to the home directory (.cargo/), not to this repository.
- 3 reads go to the directory the command is run in, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
