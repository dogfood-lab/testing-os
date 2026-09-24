# taste-engine: how it works

Mapped at 2026-09-24 from commit c87c284.

## What this is

11 parts, mostly TypeScript (142 files). Work enters through 3 doors; the busiest is CI, which reaches 2 parts. People run taste.

## What changed since 2026-09-24 (ac181ee)

Nothing structural changed since 2026-09-24; 235 files changed content.

## What comes in

1. **CI.** On a pull request touching 11 paths; on a push to main touching 11 paths; or by hand. Runs test/; checks src/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **taste** (a command people run). Runs src/cli/index.ts.

## What happens through CI

1. The workflow runs test/ in test; it checks src/ in src.
2. It writes to canon/.

## Who reads the results

Only CI itself reads what it writes.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**taste** (a command people run) runs src/cli/index.ts and writes to canon/.

## What breaks what

- **src** is imported only from tests, by 1 part (test), and sits on the path of 2 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 1 source file reaches 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

- **canon/** is written by src/backup/backup-engine.ts and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **canon/** is written by src/backup/backup-engine.ts.

## Hand-authored

People write .claude/, .github/, docs/, migrations/, proving/, the repository root, samples/ and site/; 14 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → test/backup/backup-engine.test.ts → src/backup/backup-engine.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 14 writes and 44 reads use paths built at run time and are not named here.
- 1 write and 6 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 1 command is built at run time and not followed.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
