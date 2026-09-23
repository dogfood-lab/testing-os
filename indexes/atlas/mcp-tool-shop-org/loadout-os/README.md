# loadout-os: how it works

Mapped at 2026-09-23 from commit 61d98b6.

## What this is

9 parts, mostly TypeScript (84 files). Work enters through 5 doors; the busiest is CI, which reaches 4 parts. It publishes to npm. People run ai-loadout, claude-memories and claude-rules.

## What changed since 2026-09-23 (741a092)

- ai-loadout (packages/kernel/package.json) is a new command. It runs packages/kernel/src/cli.ts.
- claude-memories (packages/memories/package.json) is a new command. It runs packages/memories/src/cli.ts.
- claude-rules (packages/rules/package.json) is a new command. It runs packages/rules/src/cli.ts.
- .claude/projects/F--AI/memory/index.json is now written by packages/cli/src/refresh.ts.
- .claude/signals.json is now written by packages/rules/src/signals.ts.
- .claude/loadout/index.json is now read by packages/rules/src/stats.ts.
- And 4 more new writers and readers of places.
- 376 files changed content, across 9 parts.

## What comes in

1. **CI.** On a pull request touching 8 paths; on a push to main touching 8 paths; or by hand. Checks packages/cli/src/, packages/kernel/src/, packages/memories/src/ and 1 more.
2. **Release.** When a tag matching `v*` is pushed. Runs packages/cli/esbuild.config.mjs; checks packages/cli/src/, packages/kernel/src/, packages/memories/src/ and 1 more.
3. **claude-memories** (a command people run). Runs packages/memories/src/cli.ts.
4. **claude-rules** (a command people run). Runs packages/rules/src/cli.ts.
5. **ai-loadout** (a command people run). Runs packages/kernel/src/cli.ts.

## What happens through CI

1. The workflow checks packages/cli/src/ in cli, packages/kernel/src/ in kernel, packages/memories/src/ in memories and packages/rules/src/ in rules.
2. It deploys the site.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs packages/cli/esbuild.config.mjs, checks packages/cli/src/, packages/kernel/src/, packages/memories/src/ and 1 more, publishes to npm, and creates a GitHub release.

**claude-memories** (a command people run) runs packages/memories/src/cli.ts and reaches kernel.

**claude-rules** (a command people run) runs packages/rules/src/cli.ts, reaches kernel, and writes to .claude/.

**ai-loadout** (a command people run) runs packages/kernel/src/cli.ts.

## What breaks what

- **kernel** is imported by 4 parts (cli, hook, memories, rules) and sits on the path of 5 doors.
- **memories** is imported by 1 part (cli) and sits on the path of 3 doors.
- **rules** is imported by 1 part (cli) and sits on the path of 3 doors.
- **cli** is imported by no other part and sits on the path of 2 doors.
- **.claude/** is written by rules and read by cli and rules; a hand edit reaches every reader.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **hook** is imported by no test.
- **site** is imported by no test.

## Written but never read

- **.claude/projects/F--AI/memory/index.json** is written by packages/cli/src/refresh.ts and read by nothing else in this repository.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **extractKeywords** is exported by packages/memories/src/analyze.ts (memories) and packages/rules/src/analyze.ts (rules); the two look alike.
- **fail** is exported by packages/cli/src/console.ts (cli) and packages/rules/src/console.ts (rules); the two look alike.
- **flagValue** is exported by packages/cli/src/console.ts (cli) and packages/rules/src/console.ts (rules); the two look alike.
- **hasFlag** is exported by packages/cli/src/console.ts (cli) and packages/rules/src/console.ts (rules); the two look alike.
- **info** is exported by packages/cli/src/console.ts (cli) and packages/rules/src/console.ts (rules); the two look alike.

And 4 more pairs.

## Generated, never hand-edited

- **.claude/** is written by packages/cli/src/refresh.ts and packages/rules/src/signals.ts.

## Hand-authored

People write .github/, packages/kernel/, packages/memories/, packages/rules/ and the repository root. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → packages/kernel/src/

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 file uses syntax the parser cannot read, so what it imports is not known: an import type followed by `[]` (1).
- 7 writes and 59 reads use paths built at run time and are not named here.
- 12 commands are built at run time and not followed, 11 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
