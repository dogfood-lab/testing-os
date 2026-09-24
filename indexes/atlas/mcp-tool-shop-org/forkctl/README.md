# forkctl: how it works

Mapped at 2026-09-24 from commit 72e9d21.

## What this is

7 parts, mostly TypeScript (128 files). Work enters through 5 doors; the busiest is CI, which reaches 2 parts. People run forkctl and forkctl-mcp.

## What changed since 2026-09-24 (31ad2f4)

- .github/workflows/ is now read by src/lib/rename/identity/simple-text.ts.
- LICENSE is now also read by src/lib/rename/identity/simple-text.ts.
- README.md is now also read by src/lib/rename/identity/simple-text.ts.
- And 2 more new writers and readers of places.
- No file changed.

## What comes in

1. **CI.** On a pull request touching 11 paths; on a push to main touching 11 paths; or by hand. Runs tests/assess.test.ts, tests/audit.test.ts, tests/backend-hardening.test.ts and 47 more; checks src/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **@mcptoolshop/forkctl** (the package's entry, not published from here). Loads src/index.ts.
4. **forkctl** (a command people run). Runs src/cli.ts.
5. **forkctl-mcp** (a command people run). Runs src/server.ts.

## What happens through CI

1. The workflow runs 50 files in tests; it checks src/ in src.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**@mcptoolshop/forkctl** (the package's entry, not published from here) loads src/index.ts.

**forkctl** (a command people run) runs src/cli.ts and changes other repositories through the GitHub API.

**forkctl-mcp** (a command people run) runs src/server.ts and changes other repositories through the GitHub API.

## What breaks what

- **src** is imported only from tests, by 1 part (tests), and sits on the path of 4 doors.

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

People write .github/, assets/, design/, the repository root and site/; 8 writes with paths built at run time may land here.

## Where to start

src/cli.ts

Read those in order to follow one run of forkctl end to end. This path follows forkctl (a command people run) from its entry, since CI runs only tests.

## What this map cannot see

- 1 import site could not be resolved.
- 8 writes and 8 reads use paths built at run time and are not named here.
- 26 writes and 22 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 3 commands are built at run time and not followed.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
