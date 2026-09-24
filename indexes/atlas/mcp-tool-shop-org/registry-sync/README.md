# registry-sync: how it works

Mapped at 2026-09-24 from commit e8f8621.

## What this is

7 parts, mostly TypeScript (40 files). Work enters through 5 doors; CI and Publish each reach 2 parts, and CI is followed because a pull request goes through it. It publishes to npm. People run registry-sync. People import @mcptoolshop/registry-sync.

## What changed since 2026-09-23 (e78b5d0)

- CI's pull request trigger now also names `atlas/**`.
- CI's push trigger now also names `atlas/**`.
- CI now also runs src/cli.ts.
- CHANGELOG.md is now read by test/version.test.ts.
- README.md is now read by test/providers/github.test.ts.
- package.json is now also read by test/cli-commands.test.ts and test/version.test.ts.
- 2 files added and 80 changed content, across 7 parts.

## What comes in

1. **CI.** On a pull request touching 7 paths; on a push to main touching 7 paths; or by hand. Runs src/cli.ts and test/.
2. **Publish.** When a release is published; or by hand. Runs test/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **@mcptoolshop/registry-sync** (the package people import). Loads src/index.ts.
5. **registry-sync** (a command people run). Runs src/cli.ts.

## What happens through CI

1. The workflow runs src/cli.ts in src and test/ in test.
   1. Inside src/cli.ts, main does, in order:
      1. load config
      2. audit
      3. format audit json
      4. format audit markdown
      5. format audit table
      6. load config
      7. audit
      8. plan
      9. format plan json
      10. format plan markdown
      11. format plan table
      12. load config, and 6 more
   2. **Audit** runs, in order: list org repos, p limit, read package json, has dockerfile, get npm package info, compare semver and list ghcr packages.
   3. **Audit** runs, in order: list org repos, p limit, read package json, has dockerfile, get npm package info, compare semver and list ghcr packages.
   4. **Audit** runs, in order: list org repos, p limit, read package json, has dockerfile, get npm package info, compare semver and list ghcr packages.
2. It runs gh.
3. It changes other repositories through the GitHub API.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Publish** runs test/, reaches src, and publishes to npm.

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

.github/workflows/ci.yml → src/cli.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 4 writes and 6 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
