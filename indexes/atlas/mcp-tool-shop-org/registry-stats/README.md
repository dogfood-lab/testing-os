# registry-stats: how it works

Mapped at 2026-10-12 from commit 94103b5 by Atlas 1.26.0.

## What this is

8 parts, mostly TypeScript (45 files), C# (10), JavaScript (9), Astro (6), HTML (4) and CSS (3). Work enters through 7 doors; Daily Refresh and Desktop CI (MSIX) each reach 3 parts, and Daily Refresh is followed because it commits into the repository. It publishes to npm. It deploys a site to GitHub Pages. People run registry-stats. People import @mcptoolshop/registry-stats.

## What changed since 2026-10-06 (0ae338a)

Nothing structural changed since 2026-10-06; no file changed.

## What comes in

1. **Desktop CI (MSIX).** On a pull request to main touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/scripts/audit.mjs, desktop/RegistryPulse.Tests/RegistryPulse.Tests.csproj, site/astro.config.mjs and 2 more; builds src/index.ts and desktop/RegistryPulse.Desktop/RegistryPulse.Desktop.csproj. On a push to main or by hand, it also runs site/scripts/fetch-stats.mjs.
2. **Daily Refresh.** On a schedule (`0 6 * * *`); or by hand. Runs site/scripts/fetch-stats.mjs, src/backend-fixes.test.ts, src/bulk-settle.test.ts and 25 more; builds src/index.ts.
3. **CI.** On a pull request; on a push to main touching 8 paths; or by hand. Runs src/backend-fixes.test.ts, src/bulk-settle.test.ts, src/cache.test.ts and 24 more; builds src/index.ts.
4. **Deploy site to GitHub Pages.** On a pull request touching 3 paths; on a push to main touching 3 paths; on a schedule (`0 7 * * 1`), Monday at 07:00 UTC; or by hand. Runs site/scripts/audit.mjs, site/astro.config.mjs and site/src/; builds src/index.ts. Except on a pull request, it also runs site/scripts/fetch-stats.mjs.
5. **Release.** When a release is published; or by hand. Runs src/backend-fixes.test.ts, src/bulk-settle.test.ts, src/cache.test.ts and 24 more; builds src/index.ts.
6. **@mcptoolshop/registry-stats** (the package people import). Loads src/index.ts.
7. **registry-stats** (a command people run). Runs src/cli.ts.

## What happens through Daily Refresh

1. The workflow runs site/scripts/fetch-stats.mjs in the site, 9 files in src, and test/ in test; it builds src/index.ts in src.
   1. Inside site/scripts/fetch-stats.mjs, `main` does, in order: `index.ts` (src, 6 steps).
2. It writes to site/public/data/packages.json, site/public/data/stats.json, site/src/data/history.json, site/src/data/snapshots.json and site/src/data/stats.json.
3. It commits site/public/data/packages.json, site/public/data/stats.json, site/src/data/history.json, site/src/data/snapshots.json and site/src/data/stats.json, then pushes.

## Who reads the results

Only Daily Refresh itself reads what it writes.

## The other doors

**Desktop CI (MSIX)** runs site/scripts/audit.mjs, desktop/RegistryPulse.Tests/RegistryPulse.Tests.csproj, site/astro.config.mjs and 2 more, builds src/index.ts and desktop/RegistryPulse.Desktop/RegistryPulse.Desktop.csproj, runs site/scripts/fetch-stats.mjs on a push to main or by hand, and writes to site/public/data/packages.json, site/public/data/stats.json, site/src/data/history.json, site/src/data/snapshots.json and site/src/data/stats.json on a push to main or by hand.

**CI** runs src/backend-fixes.test.ts, src/bulk-settle.test.ts, src/cache.test.ts and 24 more, and builds src/index.ts.

**Deploy site to GitHub Pages** runs site/scripts/audit.mjs, site/astro.config.mjs and site/src/, builds src/index.ts, runs site/scripts/fetch-stats.mjs except on a pull request, writes to site/public/data/packages.json, site/public/data/stats.json, site/src/data/history.json, site/src/data/snapshots.json and site/src/data/stats.json except on a pull request, and commits site/public/data/packages.json, site/public/data/stats.json, site/src/data/history.json, site/src/data/snapshots.json and site/src/data/stats.json, then pushes, and deploys the site, except on a pull request.

**Release** runs src/backend-fixes.test.ts, src/bulk-settle.test.ts, src/cache.test.ts and 24 more, builds src/index.ts, and publishes to npm.

**@mcptoolshop/registry-stats** (the package people import) loads src/index.ts.

**registry-stats** (a command people run) runs src/cli.ts.

## What breaks what

- **src** is imported by 1 part (the site), and by 1 more only from tests; it sits on the path of 7 doors.
- **the site** is imported by no other part and sits on the path of 3 doors.
- **test** is imported by no other part and sits on the path of 3 doors.
- **site/src/data/stats.json** is written by .github and the site, and read by the site; a hand edit reaches every reader.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **desktop** is imported by no test.

## Written but never read

- **site/public/data/packages.json** is written by .github/workflows/daily-refresh.yml, .github/workflows/pages.yml and site/scripts/fetch-stats.mjs, and read by nothing else in this repository.
- **site/public/data/stats.json** is written by .github/workflows/daily-refresh.yml, .github/workflows/pages.yml and site/scripts/fetch-stats.mjs, and read by nothing else in this repository.
- **site/src/data/history.json** is written by .github/workflows/daily-refresh.yml, .github/workflows/pages.yml and site/scripts/fetch-stats.mjs, and read by nothing else in this repository.
- **site/src/data/snapshots.json** is written by .github/workflows/daily-refresh.yml, .github/workflows/pages.yml and site/scripts/fetch-stats.mjs, and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **.claude/** is written by github-actions[bot], which added every file in it.
- **assets/** is written by github-actions[bot], which added every file in it.
- **site/public/data/packages.json** is written by .github/workflows/daily-refresh.yml, .github/workflows/pages.yml and site/scripts/fetch-stats.mjs.
- **site/public/data/stats.json** is written by .github/workflows/daily-refresh.yml, .github/workflows/pages.yml and site/scripts/fetch-stats.mjs.
- **site/src/data/history.json** is written by .github/workflows/daily-refresh.yml, .github/workflows/pages.yml and site/scripts/fetch-stats.mjs.
- **site/src/data/snapshots.json** is written by .github/workflows/daily-refresh.yml, .github/workflows/pages.yml and site/scripts/fetch-stats.mjs.
- **site/src/data/stats.json** is written by .github/workflows/daily-refresh.yml, .github/workflows/pages.yml and site/scripts/fetch-stats.mjs.

## Hand-authored

People write .github/ and the repository root. Nothing in this repository writes to them.

## Where to start

.github/workflows/desktop-ci.yml → src/index.ts → src/fetch.ts → src/types.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 4 imports could not be resolved: `desktop/RegistryPulse.Desktop/Resources/Raw/wwwroot/registry-stats/vendor/chartjs-plugin-zoom.min.js` imports `chart.js`, which is not declared; `desktop/RegistryPulse.Desktop/Resources/Raw/wwwroot/registry-stats/vendor/chartjs-plugin-zoom.min.js` imports `chart.js/helpers`, which is not declared; `desktop/RegistryPulse.Desktop/Resources/Raw/wwwroot/registry-stats/vendor/chartjs-plugin-zoom.min.js` imports `hammerjs`, which is not declared; and 1 more.
- 45 reads go to a path their caller passes, not to this repository.
- 1 write and 3 reads go to the directory the command is run in (registry-stats.config.json), not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
