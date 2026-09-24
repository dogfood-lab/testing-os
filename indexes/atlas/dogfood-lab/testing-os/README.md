# testing-os: how it works

Mapped at 2026-09-24 from commit 63dba03.

## What this is

23 parts, mostly JavaScript (1109 files). Work enters through 14 doors; the busiest is Ingest dogfood submission, which reaches 7 parts and commits into the repository (Release reaches 12 but commits nothing). It publishes workspace packages to npm and a container image. People run atlas, atlas-fleet, dogfood-init, dogfood-report, dogfood-verify, findings, report and swarm.

## What changed since 2026-09-24 (5aa5c6f)

Nothing structural changed since 2026-09-24; 4 files added and 33 changed content.

## What comes in

1. **Release.** When a tag matching `v*.*.*` is pushed; or by hand. Runs docker/entrypoint.sh, packages/atlas/cli.js, scripts/build.mjs and 602 more; checks site/public/atlas/hero.webp, site/public/atlas/index.html, site/public/atlas/render.js and 5 more.
2. **CI.** On a pull request touching 23 paths; on a push touching 23 paths; or by hand. Runs packages/atlas/cli.js, scripts/build.mjs, scripts/check-doc-drift.mjs and 601 more; checks packages/schemas/src/.
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
   4. **Write record** runs, in order: is unsafe segment, read chain head, submission digest, validate record and append chain entry.
   5. Inside packages/portfolio/generate.js, main does, in order: compute trends, atomic write file sync (findings), generate badges and atomic write file sync.
2. That reaches dogfood-swarm (1 file), findings (2 files) and verify (10 files).
3. It writes to README.md, docker/Dockerfile, indexes/, package-lock.json, policies/repos/, records/ and reports/dogfood-portfolio.json.
4. It commits indexes/ and records/, then pushes.

## Who reads the results

- **README.md** is read by packages/atlas/adapter/fleet.js, packages/atlas/core/fixture-repo.js, packages/atlas/core/unseen.js and scripts/doc-drift-patterns.json (found by text), and by 19 tests.
- **docker/Dockerfile** is read by scripts/docker-image.test.mjs (from tests).
- **indexes/** is read by packages/report/status.js, scripts/atlas-render.mjs and site/public/dashboard/index.html (found by text), and by 5 tests.
- **package-lock.json** is read by packages/dogfood-swarm/lib/domains.js, and by 2 tests.
- **policies/repos/** is read by packages/ingest/load-context.js, packages/portfolio/generate.js and packages/verify/cli.js, and by 8 tests.
- **records/** is read by packages/findings/README.md (found by text), packages/findings/derive/load-records.js, packages/ingest/rebuild-indexes.js, packages/portfolio/lib/compute-trends.js and packages/report/status.js, and by 12 tests.
- **reports/dogfood-portfolio.json** is read by 2 tests.

## The other doors

**Release** runs docker/entrypoint.sh, packages/atlas/cli.js, scripts/build.mjs and 602 more, checks site/public/atlas/hero.webp, site/public/atlas/index.html, site/public/atlas/render.js and 5 more, writes to README.md, docker/Dockerfile, dogfood/roadmap/, indexes/, package-lock.json, policies/repos/ and records/, runs git, publishes workspace packages to npm and a container image, and creates a GitHub release.

**CI** runs packages/atlas/cli.js, scripts/build.mjs, scripts/check-doc-drift.mjs and 601 more, checks packages/schemas/src/, writes to README.md, docker/Dockerfile, dogfood/roadmap/, indexes/, package-lock.json, policies/repos/ and records/, and runs git.

**self-dogfood** runs packages/report/cli.js, scripts/build.mjs and scripts/sync-version.mjs, checks packages/schemas/src/, writes to README.md, docker/Dockerfile and package-lock.json, and sends a dispatch to dogfood-lab/testing-os.

**Deploy site to GitHub Pages** runs scripts/check-accent-color.test.mjs, site/astro.config.mjs and site/src/, and deploys the site.

**Atlas render** runs scripts/atlas-render.mjs and reaches atlas.

**swarm** (a command people run) runs packages/dogfood-swarm/cli.js, reaches findings, ingest, report, schemas and verify, writes to dogfood/roadmap/, indexes/, policies/repos/ and records/, and runs git.

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
- **indexes/** is written by ingest and read by ingest, portfolio, report, scripts and site; a hand edit reaches every reader.
- **records/** is written by ingest and read by findings, ingest, portfolio and report; a hand edit reaches every reader.

## What tends to change together

No two source files, other than a file and its own test, changed together often enough to name.

1 file changed together with its own test, as expected.

Window: 180 days; a pair counts from 10 shared commits, since 33 source files reach 10 revisions; the floor falls to 3 when fewer than 20 do.

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
- **indexes/** is written by packages/ingest/anchor/compute-root.js, packages/ingest/lib/chain-manifest.js, packages/ingest/rebuild-indexes.js and packages/portfolio/generate.js.
- **package-lock.json** has a block written by scripts/sync-version.mjs.
- **policies/repos/** is written by packages/findings/lib/rename-with-retry.js and packages/findings/synthesis/apply-recommendation.js.
- **records/** is written by packages/ingest/persist.js.
- **reports/** is written by packages/portfolio/generate.js.

## Hand-authored

People write .github/, assets/, docs/, examples/ and swarms/; 6 writes with paths built at run time may land here.

## Where to start

.github/workflows/ingest.yml → packages/ingest/run.js → packages/ingest/persist.js → records/ → packages/report/status.js

Read those in order to follow one dogfood submission end to end.

## What this map cannot see

- 2 import sites name a declared dependency that shares its name with a local module (datasets); they are read as the dependency, which is not in this repository.
- 79 import sites could not be resolved.
- 3 import sites name a path outside this repository, so what they load is not followed.
- 11 files in fixtures use syntax the parser cannot read (fixtures/atlas/grammar-shapes/src/broken.ts, fixtures/atlas/languages/js/broken.js, fixtures/atlas/languages/py/broken.py and 8 more), so what they import is not known: a bare `&` in JSX text (1) and other syntax (10).
- 6 writes and 32 reads use paths built at run time and are not named here.
- 8 writes go to places this repository does not track, so they are not listed as generated.
- 82 writes and 489 reads go to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository.
- 31 commands are built at run time and not followed, 22 of them in tests.
- Readers marked (found by text) come from scanning unparsed files.
- Release runs or checks 592 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.
- CI runs or checks 588 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
