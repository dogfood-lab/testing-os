# registry-stats: how it works

Mapped at 2026-09-25 from commit ccdcd13.

## What this is

8 parts, mostly TypeScript (35 files) and JavaScript (2). Work enters through 7 doors; the busiest is Daily Refresh, which reaches 3 parts. It publishes to npm. People run registry-stats. People import @mcptoolshop/registry-stats.

## What changed since 2026-09-25 (38f6612)

Nothing structural changed since 2026-09-25; no file changed.

## What comes in

1. **Daily Refresh.** On a schedule (`0 6 * * *`); or by hand. Runs site/scripts/fetch-stats.mjs, src/cache.test.ts, src/calc.test.ts and 16 more; builds src/index.ts.
2. **CI.** On a pull request touching 7 paths; on a push to main touching 7 paths; or by hand. Runs src/cache.test.ts, src/calc.test.ts, src/cli.test.ts and 15 more; builds src/index.ts.
3. **Deploy site to GitHub Pages.** On a pull request touching 3 paths; on a push to main touching 3 paths; on a schedule (`0 7 * * 1`), Monday at 07:00 UTC; or by hand. Runs site/astro.config.mjs and site/src/; builds src/index.ts. Except on a pull request, it also runs site/scripts/fetch-stats.mjs.
4. **Desktop CI (MSIX).** On a pull request to main touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/scripts/fetch-stats.mjs, site/astro.config.mjs and site/src/; checks desktop/RegistryPulse.Tests/RegistryPulse.Tests.csproj.
5. **Release.** When a release is published; or by hand. Runs src/cache.test.ts, src/calc.test.ts, src/cli.test.ts and 15 more; builds src/index.ts.
6. **@mcptoolshop/registry-stats** (the package people import). Loads src/index.ts.
7. **registry-stats** (a command people run). Runs src/cli.ts.

## What happens through Daily Refresh

1. The workflow runs site/scripts/fetch-stats.mjs in the site, 5 files in src, and test/ in test; it builds src/index.ts in src.
2. It writes to site/public/data/packages.json, site/public/data/stats.json, site/src/data/history.json, site/src/data/snapshots.json and site/src/data/stats.json.
3. It commits site/src/data/history.json, site/src/data/snapshots.json and site/src/data/stats.json, then pushes.

## Who reads the results

Only Daily Refresh itself reads what it writes.

## The other doors

**CI** runs src/cache.test.ts, src/calc.test.ts, src/cli.test.ts and 15 more, and builds src/index.ts.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, builds src/index.ts, runs site/scripts/fetch-stats.mjs except on a pull request, writes to site/public/data/packages.json, site/public/data/stats.json, site/src/data/history.json, site/src/data/snapshots.json and site/src/data/stats.json except on a pull request, and commits site/src/data/snapshots.json and site/src/data/stats.json, then pushes, and deploys the site, except on a pull request.

**Desktop CI (MSIX)** runs site/scripts/fetch-stats.mjs, site/astro.config.mjs and site/src/, checks desktop/RegistryPulse.Tests/RegistryPulse.Tests.csproj, and writes to site/public/data/packages.json, site/public/data/stats.json, site/src/data/history.json, site/src/data/snapshots.json and site/src/data/stats.json.

**Release** runs src/cache.test.ts, src/calc.test.ts, src/cli.test.ts and 15 more, builds src/index.ts, and publishes to npm.

**@mcptoolshop/registry-stats** (the package people import) loads src/index.ts.

**registry-stats** (a command people run) runs src/cli.ts.

## What breaks what

- **src** is imported only from tests, by 1 part (test), and sits on the path of 6 doors.
- **the site** is imported by no other part and sits on the path of 3 doors.
- **test** is imported by no other part and sits on the path of 3 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

- **site/public/data/packages.json** is written by site/scripts/fetch-stats.mjs and read by nothing else in this repository.
- **site/public/data/stats.json** is written by site/scripts/fetch-stats.mjs and read by nothing else in this repository.
- **site/src/data/stats.json** is written by .github/workflows/daily-refresh.yml and site/scripts/fetch-stats.mjs, and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **site/public/data/packages.json** is written by site/scripts/fetch-stats.mjs.
- **site/public/data/stats.json** is written by site/scripts/fetch-stats.mjs.
- **site/src/data/history.json** has a block written by site/scripts/fetch-stats.mjs.
- **site/src/data/snapshots.json** has a block written by site/scripts/fetch-stats.mjs.
- **site/src/data/stats.json** is written by .github/workflows/daily-refresh.yml and site/scripts/fetch-stats.mjs.

## Hand-authored

People write .claude/, .github/, assets/ and the repository root. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → src/index.ts → src/types.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 import could not be resolved: `site/scripts/fetch-stats.mjs` imports `@mcptoolshop/registry-stats`, which no workspace member provides.
- 8 reads go to a path their caller passes, not to this repository.
- 1 write and 3 reads go to the directory the command is run in (registry-stats.config.json), not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
