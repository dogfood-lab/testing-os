# loadout-os: how it works

Mapped at 2026-09-24 from commit 61d98b6.

## What this is

9 parts, mostly TypeScript (84 files). Work enters through 6 doors; the busiest is CI, which reaches 5 parts. It publishes to npm. People run ai-loadout, claude-memories, claude-rules and loadout-os.

## What changed since 2026-09-23 (741a092)

- CI now also runs site/astro.config.mjs and site/src/.
- loadout-os (packages/cli/package.json) is a new command. It runs no file this map can see.
- ai-loadout (packages/kernel/package.json) is a new command. It runs packages/kernel/src/cli.ts.
- And 2 more changes to doors.
- .claude/CLAUDE.md is now also read by packages/cli/src/tests/split.test.ts.
- apps/hook/ is now also read by ROADMAP.md.
- packages/kernel/site/src/content/docs/ is now read by packages/kernel/site/astro.config.mjs.
- And 10 more new writers and readers of places.
- .claude was generated and is now authored.
- 376 files changed content, across 9 parts.

## What comes in

1. **CI.** On a pull request touching 8 paths; on a push to main touching 8 paths; or by hand. Runs site/astro.config.mjs and site/src/; checks packages/cli/src/, packages/kernel/src/, packages/memories/src/ and 1 more.
2. **Release.** When a tag matching `v*` is pushed. Runs packages/cli/esbuild.config.mjs; checks packages/cli/src/, packages/kernel/src/, packages/memories/src/ and 1 more.
3. **claude-memories** (a command people run). Runs packages/memories/src/cli.ts.
4. **claude-rules** (a command people run). Runs packages/rules/src/cli.ts.
5. **ai-loadout** (a command people run). Runs packages/kernel/src/cli.ts.
6. **loadout-os** (a command people run). Runs packages/cli/dist/loadout-os.js, built from a source this map cannot place.

## What happens through CI

1. The workflow runs site/astro.config.mjs and site/src/ in site; it checks packages/cli/src/ in cli, packages/kernel/src/ in kernel, packages/memories/src/ in memories and packages/rules/src/ in rules.
2. It deploys the site on a push to main.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs packages/cli/esbuild.config.mjs, checks packages/cli/src/, packages/kernel/src/, packages/memories/src/ and 1 more, publishes to npm, and creates a GitHub release.

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

People write .claude/, .github/, packages/kernel/, packages/memories/, packages/rules/ and the repository root; 9 writes with paths built at run time may land here.

## Where to start

CI runs no code this map can follow; it only checks code, so there is no path of files to read in order.

## What this map cannot see

- 1 file uses syntax the parser cannot read (packages/memories/src/types.ts), so what it imports is not known: an import type followed by `[]` (1).
- 9 writes and 54 reads use paths built at run time and are not named here.
- 10 writes and 20 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 12 commands are built at run time and not followed, 11 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
