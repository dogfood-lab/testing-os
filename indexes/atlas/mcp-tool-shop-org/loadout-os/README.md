# loadout-os: how it works

Mapped at 2026-09-24 from commit 61d98b6.

## What this is

9 parts, mostly TypeScript (84 files). Work enters through 6 doors; the busiest is CI, which reaches 5 parts. It publishes @mcptoolshop/loadout-os (packages/cli) to npm. People run ai-loadout, claude-memories, claude-rules and loadout-os.

## What changed since 2026-09-23 (741a092)

- CI now also runs packages/cli/src/tests/console.test.ts, packages/cli/src/tests/dispatch.test.ts, packages/cli/src/tests/doctor.test.ts and 11 more.
- Release now also runs packages/cli/src/tests/console.test.ts, packages/cli/src/tests/dispatch.test.ts, packages/cli/src/tests/doctor.test.ts and 9 more.
- loadout-os (packages/cli/package.json) is a new command. It runs no file this map can see.
- And 3 more changes to doors.
- .claude/CLAUDE.md is now also read by packages/cli/src/tests/split.test.ts.
- apps/hook/ is now also read by ROADMAP.md.
- packages/kernel/site/src/content/docs/ is now read by packages/kernel/site/astro.config.mjs.
- And 10 more new writers and readers of places.
- .claude was generated and is now authored.
- 376 files changed content, across 9 parts.

## What comes in

1. **CI.** On a pull request touching 8 paths; on a push to main touching 8 paths; or by hand. Runs packages/cli/src/tests/console.test.ts, packages/cli/src/tests/dispatch.test.ts, packages/cli/src/tests/doctor.test.ts and 31 more; checks packages/cli/src/, packages/kernel/src/, packages/memories/src/ and 17 more. On a push to main, it also runs site/astro.config.mjs and site/src/.
2. **Release.** When a tag matching `v*` is pushed. Runs packages/cli/esbuild.config.mjs, packages/cli/src/tests/console.test.ts, packages/cli/src/tests/dispatch.test.ts and 32 more; checks packages/cli/src/, packages/kernel/src/, packages/memories/src/ and 17 more.
3. **claude-memories** (a command people run). Runs packages/memories/src/cli.ts.
4. **claude-rules** (a command people run). Runs packages/rules/src/cli.ts.
5. **ai-loadout** (a command people run). Runs packages/kernel/src/cli.ts.
6. **loadout-os** (a command people run). Runs packages/cli/dist/loadout-os.js, built from a source this map cannot place.

## What happens through CI

1. The workflow runs 9 files in cli, packages/kernel/src/tests/ in kernel, packages/memories/src/tests/ in memories, and packages/rules/src/tests/ in rules; it checks packages/cli/src/ in cli, packages/kernel/src/ in kernel, packages/memories/src/ in memories and packages/rules/src/ in rules.
2. On a push to main, it also runs site/astro.config.mjs and site/src/.
3. It deploys the site on a push to main.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs packages/cli/esbuild.config.mjs, packages/cli/src/tests/console.test.ts, packages/cli/src/tests/dispatch.test.ts and 32 more, checks packages/cli/src/, packages/kernel/src/, packages/memories/src/ and 17 more, publishes @mcptoolshop/loadout-os (packages/cli) to npm, and creates a GitHub release.

**claude-memories** (a command people run) runs packages/memories/src/cli.ts and reaches kernel.

**claude-rules** (a command people run) runs packages/rules/src/cli.ts and reaches kernel.

**ai-loadout** (a command people run) runs packages/kernel/src/cli.ts.

**loadout-os** (a command people run) runs packages/cli/dist/loadout-os.js, built from a source this map cannot place.

## What breaks what

- **kernel** is imported by 4 parts (cli, hook, memories, rules) and sits on the path of 5 doors.
- **memories** is imported by 1 part (cli) and sits on the path of 3 doors.
- **rules** is imported by 1 part (cli) and sits on the path of 3 doors.
- **cli** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **hook** is imported by no test.
- **site** is imported by no test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **extractKeywords** is exported by packages/memories/src/analyze.ts (memories) and packages/rules/src/analyze.ts (rules); the two look alike.
- **fail** is exported by packages/cli/src/console.ts (cli) and packages/rules/src/console.ts (rules); the two look alike.
- **flagValue** is exported by packages/cli/src/console.ts (cli) and packages/rules/src/console.ts (rules); the two look alike.
- **hasFlag** is exported by packages/cli/src/console.ts (cli) and packages/rules/src/console.ts (rules); the two look alike.
- **info** is exported by packages/cli/src/console.ts (cli) and packages/rules/src/console.ts (rules); the two look alike.

And 4 more pairs.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .claude/, .github/, packages/kernel/, packages/memories/, packages/rules/ and the repository root; 6 writes with paths built at run time may land here.

## Where to start

packages/memories/src/cli.ts

Read those in order to follow one run of claude-memories end to end. This path follows claude-memories (a command people run) from its entry, since CI runs only tests.

## What this map cannot see

- 6 writes and 10 reads use paths built at run time and are not named here.
- 16 writes and 67 reads go to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository.
- 3 commands are built at run time and not followed, 2 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
