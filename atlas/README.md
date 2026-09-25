# testing-os: how it works

Mapped at 2026-09-25 from commit 5fc5728.

## What this is

23 parts, mostly JavaScript (1296 files), TypeScript (154), Python (88), Rust (87) and GDScript (32). Work enters through 14 doors; the busiest is Ingest dogfood submission, which reaches 7 parts and commits into the repository (Release reaches 12 but commits nothing). It publishes workspace packages to npm and a container image. People run atlas, atlas-fleet, dogfood-init, dogfood-report, dogfood-verify, findings, report and swarm.

## What changed since 2026-09-25 (ce2ccd2)

Nothing structural changed since 2026-09-25; 1 file added and 5 changed content.

## What comes in

1. **Release.** When a tag matching `v*.*.*` is pushed; or by hand. Runs docker/entrypoint.sh, packages/atlas/cli.js, scripts/build.mjs and 674 more; checks site/public/atlas/hero.webp, site/public/atlas/index.html, site/public/atlas/render.js and 5 more.
2. **CI.** On a pull request touching 23 paths; on a push touching 23 paths; or by hand. Runs packages/atlas/cli.js, scripts/build.mjs, scripts/check-doc-drift.mjs and 673 more; checks packages/schemas/src/.
3. **Ingest dogfood submission.** When a repository sends a `dogfood_submission` event; or by hand. Runs packages/ingest/run.js, packages/portfolio/generate.js, scripts/build.mjs and 1 more; checks packages/schemas/src/.
4. **self-dogfood.** When the workflow CI completes; or by hand. Runs packages/report/cli.js, scripts/build.mjs and scripts/sync-version.mjs; checks packages/schemas/src/.
5. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs scripts/check-accent-color.test.mjs, site/astro.config.mjs and site/src/.
6. **Atlas render.** On a schedule (`0 6 * * 1`), Monday at 06:00 UTC; or by hand. Runs scripts/atlas-render.mjs.
7. **swarm** (a command people run). Runs packages/dogfood-swarm/cli.js.
8. **findings** (a command people run). Runs packages/findings/cli.js.
9. **dogfood-init** (a command people run). Runs packages/report/init.js.
10. **dogfood-report** (a command people run). Runs packages/report/cli.js.
11. **dogfood-verify** (a command people run). Runs packages/verify/cli.js.
12. **report** (a command people run). Runs packages/report/cli.js.
13. **atlas** (a command people run). Runs packages/atlas/cli.js.
14. **atlas-fleet** (a command people run). Runs packages/atlas/bin/atlas-fleet.js.

## What happens through Ingest dogfood submission

1. The workflow runs packages/ingest/run.js in ingest, packages/portfolio/generate.js in portfolio, and scripts/build.mjs and scripts/sync-version.mjs in scripts; it checks packages/schemas/src/ in schemas.
   1. Inside packages/ingest/run.js, `ingest` does, in order: `logStage` (dogfood-swarm), `isDuplicate`, `load-context.js` (3 steps), `verify` (verify), `writeRecord` and `rebuildIndexes`.
   2. **`loadRepoPolicy`** runs, in order: `isUnsafeSegment`, `logStage` (dogfood-swarm) and `validatePayload` (schemas).
   3. **`verify`** (verify) runs, in order: `parseRunUrlRepo`, `validateSubmissionSchema`, `validateSchemaVersion`, `validateStepResults`, `validateRequiredSteps`, `validatePolicy` and `computeVerdict`.
   4. **`writeRecord`** runs, in order: `isUnsafeSegment`, `readChainHead`, `submissionDigest`, `validateRecord` and `appendChainEntry`.
   5. Inside packages/portfolio/generate.js, `main` does, in order: `computeTrends`, `atomicWriteFileSync` (findings), `generateBadges` and `atomicWriteFileSync`.
2. That reaches dogfood-swarm (1 file), findings (2 files) and verify (10 files).
3. It writes to README.md, docker/Dockerfile, indexes/, package-lock.json, policies/repos/, records/ and reports/dogfood-portfolio.json.
4. It commits indexes/ and records/, then pushes.

## Who reads the results

- **README.md** is read by packages/atlas/core/fixture-repo.js and scripts/doc-drift-patterns.json (found by text), and by 20 tests.
- **docker/Dockerfile** is read by scripts/docker-image.test.mjs (from tests).
- **indexes/** is read by scripts/atlas-render.mjs and site/public/dashboard/index.html (found by text), and by 5 tests.
- **package-lock.json** is read by 2 tests.
- **policies/repos/** is read by packages/ingest/load-context.js, packages/portfolio/generate.js and packages/verify/cli.js, and by 8 tests.
- **records/** is read by packages/findings/README.md (found by text), packages/findings/derive/load-records.js, packages/ingest/rebuild-indexes.js and packages/portfolio/lib/compute-trends.js, and by 12 tests.
- **reports/dogfood-portfolio.json** is read by 2 tests.

## The other doors

**Release** runs docker/entrypoint.sh, packages/atlas/cli.js, scripts/build.mjs and 674 more, checks site/public/atlas/hero.webp, site/public/atlas/index.html, site/public/atlas/render.js and 5 more, writes to README.md, docker/Dockerfile, dogfood/roadmap/, indexes/, package-lock.json, policies/repos/ and records/, and to swarms/control-plane.db, which is not tracked, runs git, publishes workspace packages to npm and a container image, and creates a GitHub release.

**CI** runs packages/atlas/cli.js, scripts/build.mjs, scripts/check-doc-drift.mjs and 673 more, checks packages/schemas/src/, writes to README.md, docker/Dockerfile, dogfood/roadmap/, indexes/, package-lock.json, policies/repos/ and records/, and to swarms/control-plane.db, which is not tracked, and runs git.

**self-dogfood** runs packages/report/cli.js, scripts/build.mjs and scripts/sync-version.mjs, checks packages/schemas/src/, writes to README.md, docker/Dockerfile and package-lock.json, and sends a dispatch to dogfood-lab/testing-os.

**Deploy site to GitHub Pages** runs scripts/check-accent-color.test.mjs, site/astro.config.mjs and site/src/, and deploys the site.

**Atlas render** runs scripts/atlas-render.mjs and reaches atlas.

**swarm** (a command people run) runs packages/dogfood-swarm/cli.js, reaches findings, ingest, report, schemas and verify, writes to dogfood/roadmap/, indexes/, policies/repos/ and records/, and to swarms/control-plane.db, which is not tracked, and runs git.

**findings** (a command people run) runs packages/findings/cli.js, reaches ingest, schemas and verify, and writes to policies/repos/.

**dogfood-init** (a command people run) runs packages/report/init.js, reaches schemas, and runs git.

**dogfood-report** (a command people run) runs packages/report/cli.js and reaches schemas.

**dogfood-verify** (a command people run) runs packages/verify/cli.js and reaches schemas.

**report** (a command people run) runs packages/report/cli.js and reaches schemas.

**atlas** (a command people run) runs packages/atlas/cli.js and runs git.

**atlas-fleet** (a command people run) runs packages/atlas/bin/atlas-fleet.js.

## What breaks what

- **schemas** is imported by 6 parts (dogfood-swarm, findings, ingest, portfolio, report, verify), and by 2 more only from tests; it sits on the path of 10 doors.
- **findings** is imported by 3 parts (dogfood-swarm, ingest, portfolio), and by 1 more only from tests; it sits on the path of 5 doors.
- **ingest** is imported by 2 parts (findings, scripts), is run as a child process by 1 part (dogfood-swarm), and sits on the path of 5 doors.
- **verify** is imported by 2 parts (findings, ingest), and by 1 more only from tests; it sits on the path of 6 doors.
- **dogfood-swarm** is imported by 2 parts (ingest, scripts), and by 1 more only from tests; it sits on the path of 4 doors.
- **report** is imported by 1 part (dogfood-swarm) and sits on the path of 7 doors.
- **indexes/** is written by ingest and read by ingest, portfolio, scripts and site; a hand edit reaches every reader.
- **policies/repos/** is written by findings and read by findings, ingest, portfolio and verify; a hand edit reaches every reader.

## What tends to change together

No two source files, other than a file and its own test, changed together often enough to name.

1 file changed together with its own test, as expected.

Window: 180 days; a pair counts from 10 shared commits, since 35 source files reach 10 revisions; the floor falls to 3 when fewer than 20 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **atomicWriteFileSync** is exported by packages/findings/lib/atomic-write.js (findings) and packages/ingest/lib/atomic-write.js (ingest); the two look alike.
- **formatStatus** is exported by packages/dogfood-swarm/commands/status.js (dogfood-swarm) and packages/report/status.js (report); the two look alike.
- **renameWithRetry** is exported by packages/findings/lib/rename-with-retry.js (findings) and packages/ingest/lib/rename-with-retry.js (ingest); the two look alike.

## Generated, never hand-edited

- **README.md** has a block written by scripts/sync-version.mjs.
- **docker/Dockerfile** has a block written by scripts/sync-version.mjs.
- **dogfood/roadmap/** is written by packages/dogfood-swarm/lib/roadmap/compiler.js.
- **indexes/** is written by ingest (4 files) and packages/portfolio/generate.js.
- **package-lock.json** has a block written by scripts/sync-version.mjs.
- **policies/repos/** is written by packages/findings/lib/rename-with-retry.js and packages/findings/synthesis/apply-recommendation.js.
- **records/** is written by packages/ingest/persist.js.
- **reports/** is written by packages/portfolio/generate.js.

## Hand-authored

People write .github/, assets/, docs/, examples/ and swarms/; 6 writes with paths built at run time may land here.

## Where to start

.github/workflows/ingest.yml → packages/ingest/run.js → packages/ingest/persist.js → records/ → packages/findings/derive/load-records.js

Read those in order to follow one dogfood submission end to end.

## What this map cannot see

- 4 import sites name declared dependencies that share their names with local modules (datasets, docx and xrpl); they are read as the dependencies, which are not in this repository.
- 159 imports could not be resolved: `dogfood/scenarios/validate-scenarios.test.mjs` imports `js-yaml`, which is not declared; `fixtures/atlas/build-config/scripts/use.mjs` imports `../dist/index.js`, which a build generates; `fixtures/atlas/build-output/app/use.js` imports `@ws/bundle`, which is not declared; and 156 more.
- 3 import sites name a path outside this repository, so what they load is not followed.
- 13 files in fixtures use syntax the parser cannot read (fixtures/atlas/grammar-shapes/src/broken.ts, fixtures/atlas/grammars-rust-gdscript/scripts/broken.gd, fixtures/atlas/grammars-rust-gdscript/src/broken.rs and 10 more), so what they import is not known: a bare `&` in JSX text (1) and other syntax (12).
- 6 writes and 32 reads use paths built at run time and are not named here.
- 6 writes go to places this repository does not track, so they are not listed as generated.
- 73 writes and 525 reads go to a path their caller passes, not to this repository.
- 36 reads go to the directory the command is run in, not to this repository.
- 2 writes and 8 reads go to the directory the command is run in (.github/, dogfood/, policy.example.yaml and 2 more places) or a path their caller passes, not to this repository.
- 5 writes and 3 reads go to a temporary directory, not to this repository.
- 2 writes and 3 reads go to a temporary directory or a path their caller passes, not to this repository.
- 31 commands are built at run time and not followed, 22 of them in tests.
- 1 file belongs to no part: packages/.gitkeep.
- Readers marked (found by text) come from scanning unparsed files.
- Release runs or checks 664 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.
- CI runs or checks 660 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
