# testing-os: how it works

Mapped at 2026-09-23 from commit b8aea57.

## What this is

22 parts. Work enters through 6 doors; the busiest is Ingest dogfood submission, which reaches 7 parts and commits into the repository (CI reaches 11 but commits nothing).

## What changed since 2026-09-23 (55304f6)

Nothing structural changed since 2026-09-23; 1 file added and 9 changed content.

## What comes in

1. **CI.** On a pull request touching 22 paths; on a push touching 22 paths; or by hand. Runs packages/atlas/cli.js, scripts/build.mjs, scripts/check-doc-drift.mjs and 511 more.
2. **Release.** When a tag matching `v*.*.*` is pushed; or by hand. Runs scripts/build.mjs, scripts/check-doc-drift.mjs, scripts/check-finding-regression-pins.mjs and 510 more.
3. **Ingest dogfood submission.** When a repository sends a `dogfood_submission` event; or by hand. Runs packages/ingest/run.js, packages/portfolio/generate.js, scripts/build.mjs and 2 more.
4. **self-dogfood.** When the workflow CI completes; or by hand. Runs packages/report/cli.js, scripts/build.mjs, scripts/sync-version.mjs and 1 more.
5. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs scripts/check-accent-color.test.mjs.
6. **Atlas render.** On a schedule (`0 6 * * 1`), Monday at 06:00 UTC; or by hand. Runs scripts/atlas-render.mjs.

## What happens through Ingest dogfood submission

1. The workflow runs packages/ingest/run.js in ingest, packages/portfolio/generate.js in portfolio, packages/schemas/src/ in schemas, and scripts/build.mjs and scripts/sync-version.mjs in scripts.
   1. Inside packages/ingest/run.js, ingest does, in order: log stage (dogfood-swarm), is duplicate, load context (3 steps), verify (verify), write record and rebuild indexes.
   2. **Load repo policy** runs, in order: is unsafe segment, log stage (dogfood-swarm) and validate payload (schemas).
   3. **Verify** (verify) runs, in order:
      1. parse run url repo
      2. validate submission schema
      3. validate schema version
      4. confirm
      5. validate step results
      6. validate required steps
      7. validate policy
      8. compute verdict
   4. **Write record** runs, in order: is unsafe segment, parse rejection reason (verify), read chain head, submission digest, validate record and append chain entry.
   5. Inside packages/portfolio/generate.js, main does, in order: compute trends, atomic write file sync (findings), generate badges and atomic write file sync.
2. That reaches dogfood-swarm (1 file), findings (2 files) and verify (10 files).
3. It writes to indexes/, records/ and reports/.
4. It commits indexes/ and records/, then pushes.

## Who reads the results

- **indexes/** is read by the repository root (8 README files), examples/README.md (found by text), packages/portfolio/README.md (found by text), packages/report/status.js, site/public/dashboard/index.html (found by text) and site/src/content/docs/handbook/read-model.md (found by text).
- **records/** is read by packages/findings/derive/load-records.js, packages/ingest/rebuild-indexes.js, packages/portfolio/lib/compute-trends.js and packages/report/status.js.

## The other doors

**CI** runs packages/atlas/cli.js, scripts/build.mjs, scripts/check-doc-drift.mjs and 511 more, and writes to dogfood/roadmap/, indexes/, policies/repos/, records/ and reports/.

**Release** runs scripts/build.mjs, scripts/check-doc-drift.mjs, scripts/check-finding-regression-pins.mjs and 510 more, writes to dogfood/roadmap/, indexes/, policies/repos/, records/ and reports/, publishes to npm, and creates a GitHub release.

**self-dogfood** runs packages/report/cli.js, scripts/build.mjs, scripts/sync-version.mjs and 1 more, and sends a dispatch to dogfood-lab/testing-os.

**Deploy site to GitHub Pages** runs scripts/check-accent-color.test.mjs and deploys the site.

**Atlas render** runs scripts/atlas-render.mjs and writes to indexes/atlas/.

## What breaks what

- **schemas** is imported by 7 parts (dogfood, dogfood-swarm, findings, ingest, report, scripts, verify) and sits on the path of 4 doors.
- **findings** is imported by 4 parts (dogfood-swarm, ingest, portfolio, scripts) and sits on the path of 3 doors.
- **dogfood-swarm** is imported by 3 parts (ingest, schemas, scripts) and sits on the path of 3 doors.
- **verify** is imported by 3 parts (findings, ingest, scripts) and sits on the path of 3 doors.
- **ingest** is imported by 2 parts (findings, scripts) and sits on the path of 3 doors.
- **portfolio** is imported by 1 part (scripts) and sits on the path of 3 doors.
- **indexes/** is written by .github, ingest, portfolio and scripts, and read by examples, ingest, portfolio, report, the repository root, scripts and site; a hand edit reaches every reader.
- **dogfood/roadmap/** is written by dogfood-swarm and read by dogfood-swarm, scripts and site; a hand edit reaches every reader.

## What tends to change together

No two source files, other than a file and its own test, changed together often enough to name.

2 files changed together with their own tests, as expected.

Window: 180 days; a pair counts from 10 shared commits.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

- **reports/** is written by packages/portfolio/generate.js and read by nothing else in this repository.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **atomicWriteFileSync** is exported by packages/findings/lib/atomic-write.js (findings) and packages/ingest/lib/atomic-write.js (ingest); the two look alike.
- **formatStatus** is exported by packages/dogfood-swarm/commands/status.js (dogfood-swarm) and packages/report/status.js (report); the two look alike.
- **renameWithRetry** is exported by packages/findings/lib/rename-with-retry.js (findings) and packages/ingest/lib/rename-with-retry.js (ingest); the two look alike.
- **run** is exported by packages/report/cli.js (report) and packages/verify/cli.js (verify); the two look alike.

## Generated, never hand-edited

- **dogfood/roadmap/** is written by packages/dogfood-swarm/lib/roadmap/compiler.js.
- **indexes/** is written by .github/workflows/ingest.yml, packages/ingest/anchor/compute-root.js, packages/ingest/lib/chain-manifest.js, packages/ingest/rebuild-indexes.js, packages/portfolio/generate.js and scripts/atlas-render.mjs.
- **policies/repos/** is written by packages/findings/synthesis/apply-recommendation.js.
- **records/** is written by .github/workflows/ingest.yml and packages/ingest/persist.js.
- **reports/** is written by packages/portfolio/generate.js.

## Hand-authored

People write .github/, assets/, docs/, examples/, the repository root and swarms/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ingest.yml → packages/ingest/run.js → packages/verify/index.js → indexes/ → packages/report/status.js

Read those in order to follow one dogfood submission end to end.

## What this map cannot see

- 2 import sites name a declared dependency that shares its name with a local module (datasets); they are read as the dependency, which is not in this repository.
- 30 import sites could not be resolved.
- 27 writes and 188 reads use paths built at run time and are not named here.
- Readers marked (found by text) come from scanning unparsed files.
- CI runs 514 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.
- Release runs 513 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
