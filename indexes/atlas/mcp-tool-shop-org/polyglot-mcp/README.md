# polyglot-mcp: how it works

Mapped at 2026-09-25 from commit c7c22e5.

## What this is

7 parts, mostly TypeScript (36 files) and JavaScript (4). Work enters through 5 doors; CI, Deploy site to GitHub Pages, Publish to npm, @mcptoolshop/polyglot-mcp and polyglot-mcp each reach 1 part, and CI is followed because a pull request goes through it. It publishes to npm. People run polyglot-mcp. People import @mcptoolshop/polyglot-mcp.

## What changed since 2026-09-23 (a91c112)

- CI now also runs src/cache.test.ts, src/codeSpans.test.ts, src/errors.test.ts and 15 more.
- Deploy site to GitHub Pages now also runs site/astro.config.mjs and site/src/.
- Publish to npm now also runs src/cache.test.ts, src/codeSpans.test.ts, src/errors.test.ts and 15 more.
- And 2 more changes to doors.
- CHANGELOG.md is now read by src/version.test.ts.
- README.ja.md is now also read by src/translateAll.test.ts and src/translateReadme.test.ts.
- README.md is now also read by src/translateReadme.test.ts.
- And 5 more new writers and readers of places.
- 127 files changed content, across 6 parts.

## What comes in

1. **CI.** On a pull request touching 9 paths; on a push to main touching 9 paths; or by hand. Runs src/cache.test.ts, src/codeSpans.test.ts, src/errors.test.ts and 15 more; checks src/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **Publish to npm.** When a release is published; or by hand. Runs src/cache.test.ts, src/codeSpans.test.ts, src/errors.test.ts and 15 more; checks src/.
4. **@mcptoolshop/polyglot-mcp** (the package people import). Loads src/index.ts, src/cache.ts, src/codeSpans.ts and 9 more.
5. **polyglot-mcp** (a command people run). Runs src/index.ts.

## What happens through CI

1. The workflow runs 18 files in src; it checks src/ in src.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Publish to npm** runs src/cache.test.ts, src/codeSpans.test.ts, src/errors.test.ts and 15 more, checks src/, and publishes to npm.

**@mcptoolshop/polyglot-mcp** (the package people import) loads src/index.ts, src/cache.ts, src/codeSpans.ts and 9 more.

**polyglot-mcp** (a command people run) runs src/index.ts.

## What breaks what

- **src** is imported by 1 part (scripts) and sits on the path of 4 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **scripts** is imported by no test.
- **site** is imported by no test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **.claude/** is written by dependabot[bot], which added every file in it.
- **.github/** is written by dependabot[bot], which added every file in it.
- **assets/** is written by dependabot[bot], which added every file in it.
- **the repository root** is written by dependabot[bot], which added every file in it.
- **scripts/** is written by dependabot[bot], which added every file in it.
- **site/** is written by dependabot[bot], which added every file in it.

## Hand-authored

No configuration or documentation part is left to people alone.

## Where to start

src/index.ts

Read those in order to follow one run of polyglot-mcp end to end. This path follows polyglot-mcp (a command people run) from its entry, since CI runs only tests.

## What this map cannot see

- 3 writes and 5 reads use paths built at run time and are not named here.
- 3 writes and 5 reads go to a path their caller passes, not to this repository.
- 3 commands are built at run time and not followed, 1 of them in tests.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
