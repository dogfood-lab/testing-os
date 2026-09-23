# testing-os: how it works

Mapped at 2026-09-23 from commit 429ee84.

## What this is

22 parts. Work enters through 6 doors; the busiest is Ingest dogfood submission, which reaches 7 parts.

## What comes in

1. **Ingest dogfood submission.** When a repository sends a `dogfood_submission` event; or by hand. Runs packages/ingest/run.js, packages/portfolio/generate.js, scripts/build.mjs and 1 more.
2. **CI.** On a pull request; on a push touching 21 paths; or by hand. Runs scripts/build.mjs, scripts/check-doc-drift.mjs, scripts/check-finding-regression-pins.mjs and 2 more.
3. **Release.** When a tag matching `v*.*.*` is pushed; or by hand. Runs scripts/build.mjs, scripts/check-doc-drift.mjs, scripts/check-finding-regression-pins.mjs and 1 more.
4. **self-dogfood.** When the workflow CI completes; or by hand. Runs packages/report/cli.js, scripts/build.mjs and scripts/sync-version.mjs.
5. **Atlas render.** On a schedule (`0 6 * * 1`), Monday at 06:00 UTC; or by hand. Runs scripts/atlas-render.mjs.
6. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs scripts/check-accent-color.test.mjs.

## What happens through Ingest dogfood submission

1. The workflow runs packages/ingest/run.js in ingest, packages/portfolio/generate.js in portfolio, and scripts/build.mjs and scripts/sync-version.mjs in scripts.
2. That reaches dogfood-swarm (1 file), findings (2 files) and verify (10 files).
3. That reaches schemas (5 files).
4. It writes to indexes/, records/ and reports/.
5. It commits indexes/ and records/, then pushes.

## Who reads the results

- **indexes/** is read by root (8 README files), examples/README.md (found by text), packages/ingest/anchor/compute-root.js, packages/ingest/lib/chain-manifest.js, packages/ingest/rebuild-indexes.js, packages/portfolio/README.md (found by text), packages/portfolio/generate.js, packages/report/status.js, scripts/atlas-render.mjs, site/public/dashboard/index.html (found by text) and site/src/content/docs/handbook/read-model.md (found by text).
- **records/** is read by packages/findings/derive/load-records.js, packages/ingest/persist.js, packages/ingest/rebuild-indexes.js, packages/portfolio/lib/compute-trends.js and packages/report/status.js.
- **reports/** is read by packages/portfolio/generate.js.

## The other doors

**CI** runs scripts/build.mjs, scripts/check-doc-drift.mjs, scripts/check-finding-regression-pins.mjs and 2 more, and reaches ingest and portfolio.

**Release** runs scripts/build.mjs, scripts/check-doc-drift.mjs, scripts/check-finding-regression-pins.mjs and 1 more, reaches ingest and portfolio, publishes to npm, and creates a GitHub release.

**self-dogfood** runs packages/report/cli.js, scripts/build.mjs and scripts/sync-version.mjs, reaches schemas, and sends a dispatch to dogfood-lab/testing-os.

**Atlas render** runs scripts/atlas-render.mjs and writes to indexes/atlas/.

**Deploy site to GitHub Pages** runs scripts/check-accent-color.test.mjs and deploys the site.

## What breaks what

- **schemas** is imported by 7 parts (dogfood, dogfood-swarm, findings, ingest, report, scripts, verify) and sits on the path of 2 doors.
- **findings** is imported by 4 parts (dogfood-swarm, ingest, portfolio, scripts) and sits on the path of 1 door.
- **dogfood-swarm** is imported by 3 parts (ingest, schemas, scripts) and sits on the path of 1 door.
- **verify** is imported by 3 parts (findings, ingest, scripts) and sits on the path of 1 door.
- **ingest** is imported by 2 parts (findings, scripts) and sits on the path of 3 doors.
- **portfolio** is imported by 1 part (scripts) and sits on the path of 3 doors.
- **indexes/** is written by .github, ingest, portfolio and scripts, and read by examples, ingest, portfolio, report, root, scripts and site; a hand edit reaches every reader.
- **dogfood/roadmap/** is written by dogfood-swarm and read by dogfood-swarm, scripts and site; a hand edit reaches every reader.

## Generated, never hand-edited

- **.gitignore** is written by packages/dogfood-swarm/lib/worktree.js.
- **dogfood/roadmap/** is written by packages/dogfood-swarm/lib/roadmap/compiler.js.
- **indexes/** is written by .github/workflows/ingest.yml, packages/ingest/anchor/compute-root.js, packages/ingest/lib/chain-manifest.js, packages/ingest/rebuild-indexes.js, packages/portfolio/generate.js and scripts/atlas-render.mjs.
- **policies/repos/** is written by packages/findings/synthesis/apply-recommendation.js.
- **records/** is written by .github/workflows/ingest.yml and packages/ingest/persist.js.
- **reports/** is written by packages/portfolio/generate.js.

## Hand-authored

People write .github/, assets/, docs/, examples/ and swarms/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ingest.yml → packages/ingest/run.js → packages/verify/index.js → packages/schemas/src/index.ts → indexes/ → packages/report/status.js

Read those in order to follow one dogfood submission end to end.

## What this map cannot see

30 import sites did not resolve.
27 writes and 183 reads use paths built at run time and are not named here.
Readers marked (found by text) come from scanning unparsed files.
Statistics confidence is low: fewer than 20 source files reach 10 revisions in the window.
Regenerate with `npx --yes @dogfood-lab/atlas map`.
