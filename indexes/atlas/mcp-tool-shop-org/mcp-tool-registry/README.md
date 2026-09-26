# mcp-tool-registry: how it works

Mapped at 2026-09-26 from commit 2bb195f by Atlas 1.23.0.

## What this is

13 parts, mostly JavaScript (17 files), CSS (2), TypeScript (2) and Astro (1). Work enters through 5 doors; CI and Operations each reach 2 parts, and CI is followed because a pull request goes through it. It publishes to npm. It deploys a site to GitHub Pages. People import @mcptoolshop/mcp-tool-registry.

## What changed since 2026-09-25 (4fd9a95)

- CI now also runs scripts/query.mjs.
- bundles/*.json is now written by scripts/build-bundles.mjs.
- dist/REGISTRY_HEALTH.md is now written by scripts/health-report.mjs.
- dist/capabilities.json is now written by scripts/build-derived.mjs.
- And 17 more new writers and readers of places.
- bundles was generated and is now mixed.
- dist was authored and is now mixed.
- 1 file changed content, across 1 part.

## What comes in

1. **CI.** On a pull request touching 9 paths; on a push to main touching 9 paths; on a schedule (`0 0 * * 1`), Monday at 00:00 UTC; or by hand. Runs scripts/build-derived.mjs and scripts/health-report.mjs. On a schedule or by hand, it also runs scripts/build-bundles.mjs and scripts/build-site.mjs. Except on a schedule, it also runs scripts/query.mjs, scripts/validate.mjs, scripts/verify-pack.mjs and 1 more.
2. **Operations.** On an `issues` event; on a push to main touching 5 paths; when a release is published; or by hand. On a push to main or by hand, it runs tests/site-smoke.mjs. On an `issues` event, it runs scripts/patch-registry.mjs and scripts/submission-guard.mjs. On a release event, it runs scripts/build-bundles.mjs and scripts/validate.mjs. Except on an `issues` event, it runs scripts/build-derived.mjs.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **Publish to npm.** When a release is published; or by hand. Runs scripts/health-report.mjs, scripts/policy-check.mjs, scripts/test-compat.mjs and 1 more.
5. **@mcptoolshop/mcp-tool-registry** (the data package people import). Ships registry.json, bundles/agents.json, bundles/core.json and 3 more.

## What happens through CI

1. The workflow runs scripts/build-derived.mjs and scripts/health-report.mjs in scripts.
2. On a schedule or by hand, it also runs scripts/build-bundles.mjs and scripts/build-site.mjs.
3. Except on a schedule, it also runs scripts/query.mjs, scripts/validate.mjs, scripts/verify-pack.mjs and 1 more.
4. It writes to dist/REGISTRY_HEALTH.md, dist/capabilities.json, dist/derived.meta.json, dist/featured.json, dist/registry.index.json, dist/registry.llms.txt and dist/registry.report.json.
5. On a schedule or by hand, it writes to bundles/*.json.
6. It also writes to _site/, which is not tracked.
7. It runs git.

## Who reads the results

- **bundles/*.json** has no reader in this repository.
- **dist/** is read by scripts (5 files), and by 1 test.

## The other doors

**Operations** runs tests/site-smoke.mjs on a push to main or by hand, runs scripts/patch-registry.mjs and scripts/submission-guard.mjs on an `issues` event, runs scripts/build-bundles.mjs and scripts/validate.mjs on a release event, runs scripts/build-derived.mjs except on an `issues` event, writes to registry.json on an `issues` event, writes to bundles/*.json on a release event, writes to dist/capabilities.json, dist/derived.meta.json, dist/featured.json, dist/registry.index.json and dist/registry.llms.txt except on an `issues` event, runs git, commits registry.json and pushes to a branch for review, never to main, and opens a pull request, on an `issues` event, and publishes to npm on a release event.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Publish to npm** runs scripts/health-report.mjs, scripts/policy-check.mjs, scripts/test-compat.mjs and 1 more, writes to dist/REGISTRY_HEALTH.md and dist/registry.report.json, and publishes to npm.

**@mcptoolshop/mcp-tool-registry** (the data package people import) ships registry.json, bundles/agents.json, bundles/core.json and 3 more.

## What breaks what

- **scripts** is imported by no other part and sits on the path of 3 doors.
- **tests** is imported by no other part and sits on the path of 2 doors.
- **dist/registry.index.json** is written by scripts and read by scripts, and by 1 test; a hand edit reaches every reader.
- **dist/capabilities.json** is written by scripts and read by scripts; a hand edit reaches every reader.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

Every code part is touched by at least one test.

scripts is touched by tests only through a spawn: a test runs its files as a child process.

tests/registry-integrity.test.mjs runs in no workflow.

## Written but never read

- **bundles/*.json** is written by scripts/build-bundles.mjs and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **bundles/*.json** is written by scripts/build-bundles.mjs.
- **dist/REGISTRY_HEALTH.md** is written by scripts/health-report.mjs.
- **dist/capabilities.json** is written by scripts/build-derived.mjs.
- **dist/derived.meta.json** is written by scripts/build-derived.mjs.
- **dist/featured.json** is written by scripts/build-derived.mjs.
- **dist/registry.index.json** is written by scripts/build-derived.mjs.
- **dist/registry.llms.txt** is written by scripts/build-derived.mjs.
- **dist/registry.report.json** is written by scripts/health-report.mjs.
- **registry.json** has a block written by scripts/patch-registry.mjs.

## Hand-authored

People write .github/, .husky/, assets/, curation/, docs/, fixtures/, schema/ and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → scripts/build-derived.mjs → dist/capabilities.json → scripts/verify-exports.js

Read those in order to follow one pull request end to end.

## What this map cannot see

- 2 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 3 reads go to a path their caller passes, not to this repository.
- 1 command is built at run time and not followed.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
