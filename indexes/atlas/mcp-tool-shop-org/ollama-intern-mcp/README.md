# ollama-intern-mcp: how it works

Mapped at 2026-09-24 from commit 1249f83.

## What this is

11 parts, mostly TypeScript (196 files). Work enters through 8 doors; CI and Doc Drift each reach 4 parts, and CI is followed because it comes first by name. It publishes to npm and a container image. People run ollama-intern-mcp. People import ollama-intern-mcp.

## What changed since 2026-09-24 (5e48e36)

- Doc Drift now also runs tests/cli.test.ts, tests/cloudCheck.test.ts, tests/cloudClient.test.ts and 37 more.
- Release now also runs src/index.ts.
- site/src/content/docs/handbook/tools.md is now written by scripts/gen-tool-docs.mjs.
- .github/ISSUE_TEMPLATE/feature_request.md is now read by scripts/sync-doc-versions.mjs.
- CONTRIBUTING.md is now also read by scripts/sync-doc-versions.mjs.
- And 9 more new writers and readers of places.
- the site was authored and is now mixed.
- In src/index.ts, main lost a step, note prewarm in progress request.
- In src/index.ts, main lost a step, mint run id.
- In src/index.ts, main lost a step, with run context.
- And 13 more changes to the order of work.
- No file changed.

## What comes in

1. **CI.** On a pull request touching 18 paths; on a push to main touching 18 paths; or by hand. Runs scripts/gen-tool-docs.mjs, scripts/sync-doc-versions.mjs, src/index.ts and 98 more; checks hermes.config.example.yaml, package-lock.json, package.json and 93 more. When run by hand with run_generate true, it also runs scripts/cloud-smoke-generate.mjs.
2. **Doc Drift.** On a pull request touching 12 paths; on a push to main touching 12 paths; or by hand. Runs scripts/sync-doc-versions.mjs, tests/cli.test.ts, tests/cloudCheck.test.ts and 96 more; checks HANDOFF.md, README.md and SHIP_GATE.md.
3. **Release.** When a tag matching `v*.*.*` is pushed; or by hand. Runs src/index.ts, tests/cli.test.ts, tests/cloudCheck.test.ts and 96 more; checks hermes.config.example.yaml, package-lock.json, package.json and 93 more.
4. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
5. **CodeQL.** On a pull request; on a push to main; on a schedule (`0 9 * * 0`), Sunday at 09:00 UTC; or by hand. Runs no file this map can see.
6. **Dependency Review.** On a pull request. Runs no file this map can see.
7. **ollama-intern-mcp** (a command people run, from package.json). Runs src/index.ts.
8. **ollama-intern-mcp** (the package people import, from package.json). Loads src/index.ts.

## What happens through CI

1. The workflow runs scripts/gen-tool-docs.mjs and scripts/sync-doc-versions.mjs in scripts, src/index.ts in src, and 98 files in tests; it checks 4 files in the repository root and src/ in src.
   1. Inside src/index.ts, main does, in order: profiles (3 steps), ollama (3 steps), timestamp and run prewarm.
   2. **Run prewarm** runs, in order: resolve tier, resolve num ctx and timestamp.
2. When run by hand with run_generate true, it also runs scripts/cloud-smoke-generate.mjs.
3. It writes to site/src/content/docs/handbook/tools.md.

## Who reads the results

- **site/src/content/docs/handbook/tools.md** is read by scripts/sync-doc-versions.mjs and site/astro.config.mjs.

## The other doors

**Doc Drift** runs scripts/sync-doc-versions.mjs, tests/cli.test.ts, tests/cloudCheck.test.ts and 96 more, checks HANDOFF.md, README.md and SHIP_GATE.md, and reaches src.

**Release** runs src/index.ts, tests/cli.test.ts, tests/cloudCheck.test.ts and 96 more, checks hermes.config.example.yaml, package-lock.json, package.json and 93 more, creates a GitHub release on a tag push, and publishes to npm and a container image (on a run by hand, only with dry_run false).

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**CodeQL** runs no file this map can see.

**Dependency Review** runs no file this map can see.

**ollama-intern-mcp** (a command people run, from package.json) runs src/index.ts.

**ollama-intern-mcp** (the package people import, from package.json) loads src/index.ts.

## What breaks what

- **src** is imported by 2 parts (scripts, smoke), and by 1 more only from tests; it sits on the path of 5 doors.
- **tests** is run as a child process by 1 part (scripts) and sits on the path of 3 doors.
- **the repository root** is imported by no other part and sits on the path of 3 doors.
- **scripts** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **src/tools/changeBrief.ts** and **src/tools/repoBrief.ts** changed together in 7 of 9 commits, inside the src part.
- **src/tools/changeBrief.ts** and **src/tools/incidentBrief.ts** changed together in 7 of 10 commits, inside the src part.
- **src/tools/incidentBrief.ts** and **src/tools/repoBrief.ts** changed together in 7 of 10 commits, inside the src part.
- **src/tools/packs/changePack.ts** and **src/tools/packs/incidentPack.ts** changed together in 8 of 12 commits, inside the src part.
- **src/tools/packs/changePack.ts** and **src/tools/packs/repoPack.ts** changed together in 8 of 12 commits, inside the src part.

2 files changed together with their own tests, as expected.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 15 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **bench** is imported by no test.
- **examples** is imported by no test.

scripts is touched by tests only through a spawn: a test runs its files as a child process.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **site/src/content/docs/handbook/tools.md** has a block written by scripts/gen-tool-docs.mjs.

## Hand-authored

People write .github/, docs/, evals/ and the repository root; 3 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → src/index.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 import site could not be resolved.
- 3 writes and 9 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 19 writes and 32 reads go to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository.
- 3 commands are built at run time and not followed, 1 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
