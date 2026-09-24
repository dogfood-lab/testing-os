# taste-engine: how it works

Mapped at 2026-09-24 from commit c87c284.

## What this is

11 parts, mostly TypeScript (142 files). Work enters through 3 doors; the busiest is CI, which reaches 2 parts. People run taste.

## What changed since 2026-09-24 (ac181ee)

- migrations/ is now read by src/db/migrate.ts.
- canon was generated and is now authored.
- 235 files changed content, across 10 parts.

## What comes in

1. **CI.** On a pull request touching 11 paths; on a push to main touching 11 paths; or by hand. Runs test/; checks src/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **taste** (a command people run). Runs src/cli/index.ts.

## What happens through CI

1. The workflow runs test/ in test; it checks src/ in src.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**taste** (a command people run) runs src/cli/index.ts.

## What breaks what

- **src** is imported only from tests, by 1 part (test), and sits on the path of 2 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 1 source file reaches 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .claude/, .github/, canon/, docs/, migrations/, proving/, the repository root, samples/ and site/. Nothing in this repository writes to them.

## Where to start

src/cli/index.ts

Read those in order to follow one run of taste end to end. This path follows taste (a command people run) from its entry, since CI runs only tests.

## What this map cannot see

- 7 reads use paths built at run time and are not named here.
- 19 writes and 86 reads go to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository.
- 1 command is built at run time and not followed.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
