# mcp-tool-registry: how it works

Mapped at 2026-09-25 from commit 2bb195f.

## What this is

13 parts, mostly JavaScript (17 files) and TypeScript (2). Work enters through 5 doors; the busiest is @mcptoolshop/mcp-tool-registry, which reaches 3 parts. It publishes to npm. People import @mcptoolshop/mcp-tool-registry.

## What changed since 2026-09-25 (4fd9a95)

Nothing structural changed since 2026-09-25; 1 file changed content.

## What comes in

1. **@mcptoolshop/mcp-tool-registry** (the package people import). Loads registry.json, bundles/agents.json, bundles/core.json and 3 more.
2. **CI.** On a pull request touching 9 paths; on a push to main touching 9 paths; on a schedule (`0 0 * * 1`), Monday at 00:00 UTC; or by hand. Runs scripts/build-derived.mjs and scripts/health-report.mjs. Except on a pull request or on a `push` event, it also runs scripts/build-bundles.mjs and scripts/build-site.mjs. Except on a schedule, it also runs scripts/validate.mjs, scripts/verify-pack.mjs and tests/search.test.mjs.
3. **Operations.** On a `issues` event; on a push to main touching 5 paths; when a release is published; or by hand. Runs scripts/build-derived.mjs. On a `issues` event, it also runs scripts/patch-registry.mjs and scripts/submission-guard.mjs. On a release event, it also runs scripts/build-bundles.mjs and scripts/validate.mjs. Except on a `issues` event or on a release event, it also runs tests/site-smoke.mjs.
4. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
5. **Publish to npm.** When a release is published; or by hand. Runs scripts/health-report.mjs, scripts/policy-check.mjs, scripts/test-compat.mjs and 1 more.

## What happens through @mcptoolshop/mcp-tool-registry

1. The package loads 4 files in bundles, registry.json in the repository root, and schema/registry.schema.json in schema.

## Who reads the results

@mcptoolshop/mcp-tool-registry writes nothing this map can see.

## The other doors

**CI** runs scripts/build-derived.mjs and scripts/health-report.mjs, runs scripts/build-bundles.mjs and scripts/build-site.mjs except on a pull request or on a `push` event, runs scripts/validate.mjs, scripts/verify-pack.mjs and tests/search.test.mjs except on a schedule, writes to bundles/ and to _site/ and dist/, which are not tracked, and runs git.

**Operations** runs scripts/build-derived.mjs, runs scripts/patch-registry.mjs and scripts/submission-guard.mjs on a `issues` event, runs scripts/build-bundles.mjs and scripts/validate.mjs on a release event, runs tests/site-smoke.mjs except on a `issues` event or on a release event, writes to bundles/ and registry.json, and to dist/, which is not tracked, runs git, commits registry.json and pushes to a branch for review, never to main on a `issues` event, and publishes to npm on a release event.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Publish to npm** runs scripts/health-report.mjs, scripts/policy-check.mjs, scripts/test-compat.mjs and 1 more, and publishes to npm.

## What breaks what

- **scripts** is imported by no other part and sits on the path of 3 doors.
- **tests** is imported by no other part and sits on the path of 2 doors.
- **bundles/** is written by scripts and read by scripts; a hand edit reaches every reader.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **scripts** is imported by no test.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **bundles/** is written by scripts/build-bundles.mjs.
- **registry.json** has a block written by scripts/patch-registry.mjs.

## Hand-authored

People write .github/, .husky/, assets/, curation/, dist/, docs/, fixtures/, schema/ and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → scripts/build-derived.mjs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 import site could not be resolved.
- 2 reads use paths built at run time and are not named here.
- 2 writes go to places this repository does not track, so they are not listed as generated.
- 3 reads go to a path their caller passes, not to this repository.
- 2 commands are built at run time and not followed, 1 of them in tests.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
