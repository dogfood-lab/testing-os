# testing-os: how it works

Mapped at 2026-09-23 from commit bbc3dfe.

## What this is

23 parts, mostly JavaScript (887 files). Work enters through 15 doors; the busiest is Ingest dogfood submission, which reaches 7 parts and commits into the repository (CI reaches 11 but commits nothing). It publishes to npm and a container image. People run atlas, atlas-fleet, dogfood-init, dogfood-report, dogfood-verify, findings, portfolio, report and swarm.

## What changed since 2026-09-23 (3db5de1)

Nothing structural changed since 2026-09-23; 1 file changed content.

## What comes in

1. **CI.** On a pull request touching 23 paths; on a push touching 23 paths; or by hand. Runs packages/atlas/cli.js, scripts/build.mjs, scripts/check-doc-drift.mjs and 536 more; checks packages/schemas/src/.
2. **Release.** When a tag matching `v*.*.*` is pushed; or by hand. Runs packages/atlas/cli.js, scripts/build.mjs, scripts/check-doc-drift.mjs and 536 more; checks packages/schemas/src/.
3. **Ingest dogfood submission.** When a repository sends a `dogfood_submission` event; or by hand. Runs packages/ingest/run.js, packages/portfolio/generate.js, scripts/build.mjs and 1 more; checks packages/schemas/src/.
4. **self-dogfood.** When the workflow CI completes; or by hand. Runs packages/report/cli.js, scripts/build.mjs and scripts/sync-version.mjs; checks packages/schemas/src/.
5. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs scripts/check-accent-color.test.mjs, site/astro.config.mjs and site/src/.
6. **Atlas render.** On a schedule (`0 6 * * 1`), Monday at 06:00 UTC; or by hand. Runs scripts/atlas-render.mjs.
7. **findings** (a command people run). Runs packages/findings/cli.js.
8. **swarm** (a command people run). Runs packages/dogfood-swarm/cli.js.
9. **portfolio** (a command people run). Runs packages/portfolio/generate.js.
10. **dogfood-init** (a command people run). Runs packages/report/init.js.
11. **dogfood-report** (a command people run). Runs packages/report/cli.js.
12. **dogfood-verify** (a command people run). Runs packages/verify/cli.js.
13. **report** (a command people run). Runs packages/report/cli.js.
14. **atlas** (a command people run). Runs packages/atlas/cli.js.
15. **atlas-fleet** (a command people run). Runs packages/atlas/bin/atlas-fleet.js.

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
   4. **Write record** runs, in order: is unsafe segment, parse rejection reason (verify), read chain head, submission digest, validate record and append chain entry.
   5. Inside packages/portfolio/generate.js, main does, in order: compute trends, atomic write file sync (findings), generate badges and atomic write file sync.
2. That reaches dogfood-swarm (1 file), findings (2 files) and verify (10 files).
3. It writes to indexes/, records/ and reports/dogfood-portfolio.json.
4. It commits indexes/ and records/, then pushes.

## Who reads the results

- **indexes/** is read by packages/portfolio/README.md (found by text), packages/report/status.js, site/public/dashboard/index.html (found by text) and site/src/content/docs/handbook/read-model.md (found by text).
- **records/** is read by packages/findings/derive/load-records.js, packages/ingest/rebuild-indexes.js, packages/portfolio/lib/compute-trends.js and packages/report/status.js.
- **reports/dogfood-portfolio.json** has no reader in this repository.

## The other doors

**CI** runs packages/atlas/cli.js, scripts/build.mjs, scripts/check-doc-drift.mjs and 536 more, checks packages/schemas/src/, and writes to dogfood/roadmap/, indexes/, policies/repos/, records/ and reports/dogfood-portfolio.json.

**Release** runs packages/atlas/cli.js, scripts/build.mjs, scripts/check-doc-drift.mjs and 536 more, checks packages/schemas/src/, writes to dogfood/roadmap/, indexes/, policies/repos/, records/ and reports/dogfood-portfolio.json, publishes to npm and a container image, and creates a GitHub release.

**self-dogfood** runs packages/report/cli.js, scripts/build.mjs and scripts/sync-version.mjs, checks packages/schemas/src/, and sends a dispatch to dogfood-lab/testing-os.

**Deploy site to GitHub Pages** runs scripts/check-accent-color.test.mjs, site/astro.config.mjs and site/src/, and deploys the site.

**Atlas render** runs scripts/atlas-render.mjs, reaches atlas, and writes to indexes/atlas/fleet.json and indexes/atlas/state.json.

**findings** (a command people run) runs packages/findings/cli.js, reaches ingest, schemas and verify, and writes to policies/repos/.

**swarm** (a command people run) runs packages/dogfood-swarm/cli.js, reaches findings, report and schemas, and writes to dogfood/roadmap/.

**portfolio** (a command people run) runs packages/portfolio/generate.js, reaches findings and schemas, and writes to indexes/badges/, indexes/trends.json and reports/dogfood-portfolio.json.

**dogfood-init** (a command people run) runs packages/report/init.js and reaches schemas.

**dogfood-report** (a command people run) runs packages/report/cli.js and reaches schemas.

**dogfood-verify** (a command people run) runs packages/verify/cli.js and reaches schemas.

**report** (a command people run) runs packages/report/cli.js and reaches schemas.

**atlas** (a command people run) runs packages/atlas/cli.js.

**atlas-fleet** (a command people run) runs packages/atlas/bin/atlas-fleet.js.

## What breaks what

- **schemas** is imported by 6 parts (dogfood-swarm, findings, ingest, portfolio, report, verify), and by 2 more only from tests; it sits on the path of 11 doors.
- **findings** is imported by 3 parts (dogfood-swarm, ingest, portfolio), and by 1 more only from tests; it sits on the path of 6 doors.
- **verify** is imported by 2 parts (findings, ingest), and by 1 more only from tests; it sits on the path of 5 doors.
- **dogfood-swarm** is imported by 2 parts (ingest, scripts), and by 1 more only from tests; it sits on the path of 4 doors.
- **ingest** is imported by 2 parts (findings, scripts) and sits on the path of 4 doors.
- **report** is imported by 1 part (dogfood-swarm) and sits on the path of 7 doors.
- **indexes/** is written by .github, ingest, portfolio and scripts, and read by ingest, portfolio, report, scripts and site; a hand edit reaches every reader.
- **records/** is written by .github and ingest, and read by findings, ingest, portfolio and report; a hand edit reaches every reader.

## What tends to change together

- **site/public/atlas/render.js** and **site/src/components/atlas-page.test.mjs** changed together in 18 of 25 commits, inside the site part.

2 files changed together with their own tests, as expected.

Window: 180 days; a pair counts from 10 shared commits, since 29 source files reach 10 revisions; the floor falls to 3 when fewer than 20 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

- **reports/dogfood-portfolio.json** is written by packages/portfolio/generate.js and read by nothing else in this repository.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **atomicWriteFileSync** is exported by packages/findings/lib/atomic-write.js (findings) and packages/ingest/lib/atomic-write.js (ingest); the two look alike.
- **formatStatus** is exported by packages/dogfood-swarm/commands/status.js (dogfood-swarm) and packages/report/status.js (report); the two look alike.
- **renameWithRetry** is exported by packages/findings/lib/rename-with-retry.js (findings) and packages/ingest/lib/rename-with-retry.js (ingest); the two look alike.

## Generated, never hand-edited

- **dogfood/roadmap/** is written by packages/dogfood-swarm/lib/roadmap/compiler.js.
- **indexes/** is written by .github/workflows/ingest.yml, packages/ingest/anchor/compute-root.js, packages/ingest/lib/chain-manifest.js, packages/ingest/rebuild-indexes.js, packages/portfolio/generate.js and scripts/atlas-render.mjs.
- **policies/repos/** is written by packages/findings/synthesis/apply-recommendation.js.
- **records/** is written by .github/workflows/ingest.yml and packages/ingest/persist.js.
- **reports/** is written by packages/portfolio/generate.js.

## Hand-authored

People write .github/, assets/, docker/, docs/, examples/, the repository root and swarms/; 54 writes with paths built at run time may land here.

## Where to start

.github/workflows/ingest.yml → packages/ingest/run.js → packages/verify/index.js → indexes/ → packages/report/status.js

Read those in order to follow one dogfood submission end to end.

## What this map cannot see

- 2 import sites name a declared dependency that shares its name with a local module (datasets); they are read as the dependency, which is not in this repository.
- 31 import sites could not be resolved.
- 3 import sites name a path outside this repository, so what they load is not followed.
- 9 files use syntax the parser cannot read, so what they import is not known: 8 in fixtures (a NUL character inside a string in 1 and other syntax in 7), 1 in schemas (a NUL character inside a string).
- 54 writes and 206 reads use paths built at run time and are not named here.
- 1 write and 1 read go to the directory the command is run in or the home directory, not to this repository.
- 302 commands are built at run time and not followed, 279 of them in tests.
- Readers marked (found by text) come from scanning unparsed files.
- CI runs or checks 540 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.
- Release runs or checks 540 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
