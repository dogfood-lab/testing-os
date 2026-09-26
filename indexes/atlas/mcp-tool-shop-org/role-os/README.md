# role-os: how it works

Mapped at 2026-09-26 from commit c0ee720 by Atlas 1.23.0.

## What this is

15 parts, mostly JavaScript (162 files), Python (30), Astro (2), CSS (2), HTML (2) and TypeScript (2). Work enters through 4 doors; the busiest is CI, which reaches 3 parts. It publishes to npm. It deploys a site to GitHub Pages. People run roleos.

## What changed since 2026-09-25 (3877c03)

- dossier/data.js is now read by dossier/dossier.html.
- tools/conformance-dataset/audit.py is now read by tools/conformance-dataset/build_conformance_dataset.py.
- tools/conformance-dataset/config.py is now read by tools/conformance-dataset/build_conformance_dataset.py, tools/conformance-dataset/certify_conformance.py, tools/conformance-dataset/conformance_puzzles.py and tools/conformance-dataset/dogfood_conformance.py.
- And 1 more new writer or reader of a place.
- No file changed.

## What comes in

1. **CI.** On a pull request touching 13 paths; on a push touching 13 paths; or by hand. Runs bin/roleos.mjs and test/.
2. **Release.** When a release is published; or by hand. Runs test/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **roleos** (a command people run). Runs bin/roleos.mjs.

## What happens through CI

1. The workflow runs bin/roleos.mjs in bin and test/ in test.
2. That reaches src (70 files).

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs test/, reaches src, and publishes to npm on a release event.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**roleos** (a command people run) runs bin/roleos.mjs and reaches src.

## What breaks what

- **src** is imported by 4 parts (.claude, bin, dossier, tools), and by 1 more only from tests; it sits on the path of 3 doors.
- **bin** is imported by no other part and sits on the path of 2 doors.
- **test** is imported by no other part and sits on the path of 2 doors.
- **dossier/aptitude-tuned.json** is written by dossier and read by dossier; a hand edit reaches every reader.
- **dossier/portraits/briefs/** is written by dossier and read by dossier; a hand edit reaches every reader.

## What tends to change together

- **src/specialist/training-programs.mjs** and **test/specialist-training-programs.test.mjs** changed together in 5 of 6 commits, and the test part imports the src part.
- **src/specialist/record.mjs** and **test/specialist-record.test.mjs** changed together in 5 of 9 commits, and the test part imports the src part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 1 source file reaches 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **dossier** is imported by no test.

bin is touched by tests only through a spawn: a test runs its files as a child process.

3 test files run in no workflow: tools/conformance-dataset/test_certify_ship_stamp.py, tools/conformance-dataset/test_empty_write_gate.py and tools/token-budget-dataset/test_harvester.py.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **.claude/role-os/tool-contracts.json** is written by tools/conformance-dataset/live-tools/build_live_contracts.mjs.
- **dossier/aptitude-tuned.json** is written by dossier/apply-tuning-fixes.mjs and dossier/tune-aptitudes.mjs.
- **dossier/data.js** is written by dossier/build-gallery.mjs.
- **dossier/portraits/briefs/** is written by dossier/portraits/write-prompt.mjs.
- **dossier/portraits/web/** is written by dossier/optimize-portraits.py.
- **tools/conformance-dataset/** is written by tools/conformance-dataset/build_conformance_dataset.py and tools/conformance-dataset/build_tool_constraints.mjs.
- **tools/conformance-dataset/corpus_l4.json** is written by tools/conformance-dataset/author_l4.py.
- **tools/conformance-dataset/corpus_tools.json** has a block written by tools/conformance-dataset/merge_corpus.py.
- **tools/conformance-dataset/live-tools/corpus.json** is written by tools/conformance-dataset/live-tools/prep_inputs.mjs.
- **tools/conformance-dataset/live-tools/raw.json** is written by tools/conformance-dataset/live-tools/prep_inputs.mjs.

## Hand-authored

People write .github/, .role-os/, assets/, design/, examples/, the repository root, site/, specs/ and starter-pack/; 16 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → bin/roleos.mjs → src/swarm-cmd.mjs → src/swarm/domain-detect.mjs → src/run.mjs → src/artifacts.mjs → src/swarm/exit-condition.mjs → src/swarm/build-gate.mjs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 3 imports could not be resolved: `test/knowledge-integration.test.mjs` imports a path built at run time, 3 times.
- 16 writes and 14 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 28 writes and 88 reads go to the directory the command is run in, not to this repository.
- 43 writes and 40 reads go to a path their caller passes, not to this repository.
- 23 writes and 23 reads go to the directory the command is run in or a path their caller passes, not to this repository.
- 8 writes and 1 read go to a temporary directory, not to this repository.
- 10 commands are built at run time and not followed, 2 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
