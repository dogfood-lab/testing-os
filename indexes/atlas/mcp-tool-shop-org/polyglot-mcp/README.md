# polyglot-mcp: how it works

Mapped at 2026-09-23 from commit c7c22e5.

## What this is

7 parts, mostly TypeScript (36 files). Work enters through 5 doors; the busiest is @mcptoolshop/polyglot-mcp, which reaches 1 part. It publishes to npm. People run polyglot-mcp. People import @mcptoolshop/polyglot-mcp.

## What changed since 2026-09-23 (a91c112)

- Deploy site to GitHub Pages now also runs site/astro.config.mjs and site/src/.
- @mcptoolshop/polyglot-mcp (package.json) is a new package. It loads src/index.ts.
- polyglot-mcp (package.json) is a new command. It runs src/index.ts.
- site/src/content/docs/ is now read by site/astro.config.mjs.
- site/src/content/docs/handbook/ is now read by site/astro.config.mjs.
- 127 files changed content, across 6 parts.

## What comes in

1. **@mcptoolshop/polyglot-mcp** (the package people import). Loads src/index.ts.
2. **CI.** On a pull request touching 9 paths; on a push to main touching 9 paths; or by hand. Checks src/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **Publish to npm.** When a release is published; or by hand. Checks src/.
5. **polyglot-mcp** (a command people run). Runs src/index.ts.

## What happens through @mcptoolshop/polyglot-mcp

1. The package loads src/index.ts in src.

## Who reads the results

@mcptoolshop/polyglot-mcp writes nothing this map can see.

## The other doors

**CI** checks src/.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Publish to npm** checks src/ and publishes to npm.

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

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .claude/, .github/, assets/ and the repository root; 5 writes with paths built at run time may land here.

## Where to start

src/index.ts

Read those in order to follow one import of @mcptoolshop/polyglot-mcp end to end.

## What this map cannot see

- 1 file uses syntax the parser cannot read, so what it imports is not known: `typeof import(…)` as a type argument (1).
- 5 writes and 6 reads use paths built at run time and are not named here.
- 5 commands are built at run time and not followed, 2 of them in tests.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
