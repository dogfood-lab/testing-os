# registry-sync: how it works

Mapped at 2026-10-01 from commit 51abbf2 by Atlas 1.26.0.

## What this is

7 parts, mostly TypeScript (40 files), CSS (2), Astro (1) and JavaScript (1). Work enters through 5 doors; CI and Publish each reach 2 parts, and CI is followed because a pull request goes through it. It publishes to npm. It deploys a site to GitHub Pages. People run registry-sync. People import @mcptoolshop/registry-sync.

## What changed since 2026-10-01 (fae9a7c)

Nothing structural changed since 2026-10-01; no file changed.

## What comes in

1. **CI.** On a pull request to main; on a push to main touching 8 paths; or by hand. Runs src/cli.ts and test/; builds src/index.ts.
2. **Publish.** When a release is published; or by hand. Runs test/; builds src/index.ts.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **@mcptoolshop/registry-sync** (the package people import). Loads src/index.ts.
5. **registry-sync** (a command people run). Runs src/cli.ts.

## What happens through CI

1. The workflow runs src/cli.ts in src and test/ in test; it builds src/index.ts in src.
   1. Inside src/cli.ts, `main` does, in order:
      1. `loadConfig`
      2. `audit`
      3. `formatAuditJson`
      4. `formatAuditMarkdown`
      5. `formatAuditTable`
      6. `loadConfig`
      7. `audit`
      8. `plan`
      9. `formatPlanJson`
      10. `formatPlanMarkdown`
      11. `formatPlanTable`
      12. `loadConfig`, and 6 more
   2. **`audit`** runs, in order: `listOrgRepos`, `pLimit`, `readPackageJson`, `hasDockerfile`, `getNpmPackageInfo`, `compareSemver` and `listGhcrPackages`.
   3. **`audit`** runs, in order: `listOrgRepos`, `pLimit`, `readPackageJson`, `hasDockerfile`, `getNpmPackageInfo`, `compareSemver` and `listGhcrPackages`.
   4. **`audit`** runs, in order: `listOrgRepos`, `pLimit`, `readPackageJson`, `hasDockerfile`, `getNpmPackageInfo`, `compareSemver` and `listGhcrPackages`.
2. It runs gh.
3. It uploads coverage to Codecov.
4. It changes other repositories through the GitHub API.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Publish** runs test/, builds src/index.ts, and publishes to npm.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**@mcptoolshop/registry-sync** (the package people import) loads src/index.ts.

**registry-sync** (a command people run) runs src/cli.ts, runs gh, and changes other repositories through the GitHub API.

## What breaks what

- **src** is imported only from tests, by 1 part (test), and sits on the path of 4 doors.
- **test** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .claude/, .github/, the repository root, site/ and templates/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → src/cli.ts → src/config.ts → src/types.ts

Read those in order to follow one pull request end to end.

Beside the path, src/cli.ts also calls src/audit.ts, src/format/json.ts, src/format/markdown.ts, src/format/table.ts and 4 more files.

## What this map cannot see

- 4 writes and 4 reads go to a path their caller passes, not to this repository.
- 2 reads go to the directory the command is run in (package.json and registry-sync.config.json), not to this repository.
- 1 read goes to the directory the command is run in (registry-sync.config.json) or a path its caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
