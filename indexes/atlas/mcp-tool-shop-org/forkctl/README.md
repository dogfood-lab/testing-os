# forkctl: how it works

Mapped at 2026-09-24 from commit 72e9d21.

## What this is

7 parts, mostly TypeScript (128 files). Work enters through 5 doors; the busiest is CI, which reaches 2 parts. People run forkctl and forkctl-mcp.

## What changed since 2026-09-24 (31ad2f4)

Nothing structural changed since 2026-09-24; no file changed.

## What comes in

1. **CI.** On a pull request touching 11 paths; on a push to main touching 11 paths; or by hand. Runs tests/assess.test.ts, tests/audit.test.ts, tests/backend-hardening.test.ts and 37 more; checks src/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **@mcptoolshop/forkctl** (the package's entry, not published from here). Loads src/index.ts.
4. **forkctl** (a command people run). Runs src/cli.ts.
5. **forkctl-mcp** (a command people run). Runs src/server.ts.

## What happens through CI

1. The workflow runs 50 files in tests; it checks src/ in src.

## Who reads the results

CI writes nothing in the files this map could read; 7 files could not be.

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

No place is written by the files this map could read, so none goes unread; 7 files could not be.

## Helpers that look duplicated

No two parts export a helper that looks alike in the files this map could read; 7 files could not be.

## Generated, never hand-edited

Nothing in the files this map could read writes to a tracked place; 7 files could not be.

## Hand-authored

People write .github/, assets/, design/, the repository root and site/; 1 write with a path built at run time may land here.

## Where to start

.github/workflows/ci.yml → src/index.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 import site could not be resolved.
- 7 files in src use syntax the parser cannot read (src/lib/rename/identity/go-mod.ts, src/lib/rename/identity/package-json.ts, src/lib/rename/identity/simple-text.ts and 4 more), so what they import is not known: an import type followed by `[]` (7).
- 1 write and 1 read use paths built at run time and are not named here.
- 7 writes and 7 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 1 command is built at run time and not followed.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
