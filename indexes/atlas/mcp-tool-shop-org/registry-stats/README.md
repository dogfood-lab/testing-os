# registry-stats: how it works

Mapped at 2026-09-26 from commit ccdcd13 by Atlas 1.23.0.

## What this is

8 parts, mostly TypeScript (35 files), C# (8), Astro (6), HTML (4), CSS (3) and JavaScript (2). Work enters through 7 doors; Daily Refresh and Desktop CI (MSIX) each reach 3 parts, and Daily Refresh is followed because it commits into the repository. It publishes to npm. It deploys a site to GitHub Pages. People run registry-stats. People import @mcptoolshop/registry-stats.

## What changed since 2026-09-25 (38f6612)

- the site now imports src.
- Desktop CI (MSIX) now also builds desktop/RegistryPulse.Desktop/RegistryPulse.Desktop.csproj.
- site/src/data/stats.json is now also read by site/src/pages/dashboard.astro, site/src/pages/privacy.astro and site/src/pages/setup.astro.
- In site/scripts/fetch-stats.mjs, `main` gained a step, `createCache`, before `mine`.
- In site/scripts/fetch-stats.mjs, `main` gained a step, `mine`, before `bulk`.
- In site/scripts/fetch-stats.mjs, `main` gained a step, `bulk`, before `stats`.
- And 3 more changes to the order of work.
- No file changed.

## What comes in

1. **Desktop CI (MSIX).** On a pull request to main touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/scripts/fetch-stats.mjs, desktop/RegistryPulse.Tests/RegistryPulse.Tests.csproj, site/astro.config.mjs and 2 more; builds desktop/RegistryPulse.Desktop/RegistryPulse.Desktop.csproj.
2. **Daily Refresh.** On a schedule (`0 6 * * *`); or by hand. Runs site/scripts/fetch-stats.mjs, src/cache.test.ts, src/calc.test.ts and 16 more; builds src/index.ts.
3. **CI.** On a pull request touching 7 paths; on a push to main touching 7 paths; or by hand. Runs src/cache.test.ts, src/calc.test.ts, src/cli.test.ts and 15 more; builds src/index.ts.
4. **Deploy site to GitHub Pages.** On a pull request touching 3 paths; on a push to main touching 3 paths; on a schedule (`0 7 * * 1`), Monday at 07:00 UTC; or by hand. Runs site/astro.config.mjs and site/src/; builds src/index.ts. Except on a pull request, it also runs site/scripts/fetch-stats.mjs.
5. **Release.** When a release is published; or by hand. Runs src/cache.test.ts, src/calc.test.ts, src/cli.test.ts and 15 more; builds src/index.ts.
6. **@mcptoolshop/registry-stats** (the package people import). Loads src/index.ts.
7. **registry-stats** (a command people run). Runs src/cli.ts.

## What happens through Daily Refresh

1. The workflow runs site/scripts/fetch-stats.mjs in the site, 5 files in src, and test/ in test; it builds src/index.ts in src.
   1. Inside site/scripts/fetch-stats.mjs, `main` does, in order: `index.ts` (src, 6 steps).
2. It writes to site/public/data/packages.json, site/public/data/stats.json, site/src/data/history.json, site/src/data/snapshots.json and site/src/data/stats.json.
3. It commits site/src/data/history.json, site/src/data/snapshots.json and site/src/data/stats.json, then pushes.

## Who reads the results

Only Daily Refresh itself reads what it writes.

## The other doors

**Desktop CI (MSIX)** runs site/scripts/fetch-stats.mjs, desktop/RegistryPulse.Tests/RegistryPulse.Tests.csproj, site/astro.config.mjs and 2 more, builds desktop/RegistryPulse.Desktop/RegistryPulse.Desktop.csproj, reaches src, and writes to site/public/data/packages.json, site/public/data/stats.json, site/src/data/history.json, site/src/data/snapshots.json and site/src/data/stats.json.

**CI** runs src/cache.test.ts, src/calc.test.ts, src/cli.test.ts and 15 more, and builds src/index.ts.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, builds src/index.ts, runs site/scripts/fetch-stats.mjs except on a pull request, writes to site/public/data/packages.json, site/public/data/stats.json, site/src/data/history.json, site/src/data/snapshots.json and site/src/data/stats.json except on a pull request, and commits site/src/data/snapshots.json and site/src/data/stats.json, then pushes, and deploys the site, except on a pull request.

**Release** runs src/cache.test.ts, src/calc.test.ts, src/cli.test.ts and 15 more, builds src/index.ts, and publishes to npm.

**@mcptoolshop/registry-stats** (the package people import) loads src/index.ts.

**registry-stats** (a command people run) runs src/cli.ts.

## What breaks what

- **src** is imported by 1 part (the site), and by 1 more only from tests; it sits on the path of 7 doors.
- **the site** is imported by no other part and sits on the path of 3 doors.
- **test** is imported by no other part and sits on the path of 3 doors.

desktop holds only C#, CSS and HTML files, which this map does not read, so what uses it cannot be seen.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part this map reads is imported by at least one test.

desktop holds only C#, CSS and HTML files, which this map does not read, so whether a test touches it cannot be seen.

## Written but never read

- **site/public/data/packages.json** is written by site/scripts/fetch-stats.mjs and read by nothing else in this repository.
- **site/public/data/stats.json** is written by site/scripts/fetch-stats.mjs and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **.claude/** is written by github-actions[bot], which added every file in it.
- **assets/** is written by github-actions[bot], which added every file in it.
- **desktop/** is written by github-actions[bot], which added every file in it.
- **the repository root** is written by github-actions[bot], which added every file in it.
- **site/** is written by github-actions[bot], which added every file in it.
- **site/public/data/packages.json** is written by site/scripts/fetch-stats.mjs.
- **site/public/data/stats.json** is written by site/scripts/fetch-stats.mjs.
- **site/src/data/history.json** has a block written by site/scripts/fetch-stats.mjs.
- **site/src/data/snapshots.json** has a block written by site/scripts/fetch-stats.mjs.
- **site/src/data/stats.json** has a block written by site/scripts/fetch-stats.mjs.

## Hand-authored

People write .github/. Nothing in this repository writes to them.

## Where to start

.github/workflows/desktop-ci.yml → site/scripts/fetch-stats.mjs → src/index.ts → src/providers/npm.ts → src/fetch.ts → src/types.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 8 reads go to a path their caller passes, not to this repository.
- 1 write and 3 reads go to the directory the command is run in (registry-stats.config.json), not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
