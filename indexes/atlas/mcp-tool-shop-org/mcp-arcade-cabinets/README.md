# mcp-arcade-cabinets: how it works

Mapped at 2026-09-24 from commit 735b11d.

## What this is

15 parts, mostly TypeScript (156 files). Work enters through 6 doors; CI and Site each reach 10 parts, and CI is followed because it comes first by name. It publishes a package to npm, chosen at run time. People run cabinet-server, ghost-on-the-menu and vibe-typer.

## What changed since 2026-09-24 (8ebb997)

Nothing structural changed since 2026-09-24; 2 files changed content.

## What comes in

1. **CI.** On a pull request touching 20 paths; on a push to main touching 20 paths; or by hand. Runs scripts/play.mjs, apps/cabinets/test/, packages/cabinet-server/test/ and 21 more; checks apps/cabinets/package.json, fixtures/tapes/, package.json and 15 more.
2. **Site.** On a pull request touching 14 paths; on a push to main touching 14 paths; or by hand. Runs site/astro.config.mjs and site/src/. On main, it also runs scripts/play.mjs, apps/cabinets/test/, packages/cabinet-server/test/ and 21 more; checks packages/cabinet-server/src/index.ts, packages/cabinet-server/src/server-vibe.ts, packages/cabinet-server/src/server.ts and 13 more.
3. **Publish.** When a release is published; or by hand. Runs packages/launcher-vibe-typer/scripts/build.mjs, packages/launcher/scripts/build.mjs, scripts/play.mjs and 23 more; checks package.json, packages/cabinet-server/src/index.ts, packages/cabinet-server/src/server-vibe.ts and 14 more.
4. **cabinet-server** (a command people run). Runs packages/cabinet-server/dist/server.js, built from a source this map cannot place.
5. **ghost-on-the-menu** (a command people run). Runs packages/launcher/dist/cli.js, built from a source this map cannot place.
6. **vibe-typer** (a command people run). Runs packages/launcher-vibe-typer/dist/cli.js, built from a source this map cannot place.

## What happens through CI

1. The workflow runs scripts/play.mjs and scripts/test/ in scripts, packages/cabinet-server/test/ in cabinet-server, apps/cabinets/test/ in cabinets, packages/ghost-on-the-menu/test/ in ghost-on-the-menu, packages/launcher/test/ in launcher, and 22 files in 3 more parts; it checks apps/cabinets/package.json and apps/ in cabinets, 6 files in the repository root, 8 files in scripts, voice/worker.py in voice, fixtures/tapes/ in fixtures, and packages/ (6 parts).

## Who reads the results

CI writes nothing in the files this map could read; 2 files could not be.

## The other doors

**Site** runs site/astro.config.mjs and site/src/, runs scripts/play.mjs, apps/cabinets/test/, packages/cabinet-server/test/ and 21 more and checks packages/cabinet-server/src/index.ts, packages/cabinet-server/src/server-vibe.ts, packages/cabinet-server/src/server.ts and 13 more on main, and deploys the site on main.

**Publish** runs packages/launcher-vibe-typer/scripts/build.mjs, packages/launcher/scripts/build.mjs, scripts/play.mjs and 23 more, checks package.json, packages/cabinet-server/src/index.ts, packages/cabinet-server/src/server-vibe.ts and 14 more, and publishes a package to npm, chosen at run time (on a run by hand, only with dry_run false).

**cabinet-server** (a command people run) runs packages/cabinet-server/dist/server.js, built from a source this map cannot place.

**ghost-on-the-menu** (a command people run) runs packages/launcher/dist/cli.js, built from a source this map cannot place.

**vibe-typer** (a command people run) runs packages/launcher-vibe-typer/dist/cli.js, built from a source this map cannot place.

## What breaks what

- **tape-core** is imported by 4 parts (cabinet-server, cabinets, ghost-on-the-menu, vibe-typer) and sits on the path of 3 doors.
- **cabinet-server** is imported by 3 parts (cabinets, launcher, launcher-vibe-typer) and sits on the path of 3 doors.
- **ghost-on-the-menu** is imported by 2 parts (cabinet-server, cabinets) and sits on the path of 3 doors.
- **vibe-typer** is imported by 2 parts (cabinet-server, cabinets) and sits on the path of 3 doors.
- **launcher** is imported by 1 part (launcher-vibe-typer), and by 1 more only from tests; it sits on the path of 3 doors.
- **cabinets** is imported by no other part and sits on the path of 3 doors.
- **launcher-vibe-typer** is imported by no other part and sits on the path of 3 doors.
- **packages/vibe-typer/patterns/corpus/** is written by vibe-typer and read by vibe-typer; a hand edit reaches every reader.

## What tends to change together

- **apps/cabinets/src/vibe-typer.ts** and **apps/cabinets/test/typer-mount.test.ts** changed together in 17 of 23 commits, inside the cabinets part.
- **packages/ghost-on-the-menu/src/patterns.ts** and **packages/ghost-on-the-menu/src/sim.ts** changed together in 28 of 44 commits, inside the ghost-on-the-menu part.
- **packages/ghost-on-the-menu/src/sim.ts** and **packages/ghost-on-the-menu/src/types.ts** changed together in 24 of 43 commits, inside the ghost-on-the-menu part.
- **packages/ghost-on-the-menu/src/patterns.ts** and **packages/ghost-on-the-menu/test/sim.test.ts** changed together in 23 of 42 commits, inside the ghost-on-the-menu part.
- **packages/ghost-on-the-menu/src/types.ts** and **packages/ghost-on-the-menu/test/sim.test.ts** changed together in 20 of 40 commits, inside the ghost-on-the-menu part.

5 files changed together with their own tests, as expected.

Window: 180 days; a pair counts from 10 shared commits, since 33 source files reach 10 revisions; the floor falls to 3 when fewer than 20 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

- **docs/vibe-typer.author-sample.md** is written by packages/vibe-typer/scripts/author.mjs and read by nothing else in this repository.
- **packages/vibe-typer/authoring/** is written by packages/vibe-typer/scripts/author.mjs and read by nothing else in this repository.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **badArgLines** is exported by packages/launcher-vibe-typer/src/cli.ts (launcher-vibe-typer) and packages/launcher/src/cli.ts (launcher); the two look alike.
- **bugsIn** is exported by packages/launcher-vibe-typer/src/cli.ts (launcher-vibe-typer) and packages/launcher/src/cli.ts (launcher); the two look alike.
- **checkSeats** is exported by packages/launcher-vibe-typer/src/cli.ts (launcher-vibe-typer) and packages/launcher/src/cli.ts (launcher); the two look alike.
- **exitAfter** is exported by packages/launcher-vibe-typer/src/cli.ts (launcher-vibe-typer) and packages/launcher/src/cli.ts (launcher); the two look alike.
- **floorIn** is exported by packages/launcher-vibe-typer/src/cli.ts (launcher-vibe-typer) and packages/launcher/src/cli.ts (launcher); the two look alike.

And 16 more pairs.

## Generated, never hand-edited

- **docs/vibe-typer.author-sample.json** has a block written by packages/vibe-typer/scripts/author.mjs.
- **docs/vibe-typer.author-sample.md** is written by packages/vibe-typer/scripts/author.mjs.
- **packages/vibe-typer/authoring/** is written by packages/vibe-typer/scripts/author.mjs.
- **packages/vibe-typer/patterns/agent.json** has a block written by packages/vibe-typer/scripts/author.mjs.
- **packages/vibe-typer/patterns/corpus/** is written by packages/vibe-typer/scripts/author.mjs and packages/vibe-typer/scripts/port-corpus.mjs.
- **packages/vibe-typer/patterns/levels.json** has a block written by packages/vibe-typer/scripts/author.mjs.
- **packages/vibe-typer/patterns/user.json** has a block written by packages/vibe-typer/scripts/author.mjs.

## Hand-authored

People write .github/, catalog/, fixtures/, the repository root and site/; 12 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → scripts/play.mjs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 17 import sites could not be resolved.
- 2 files use syntax the parser cannot read (apps/cabinets/test/typer-menu.test.ts and packages/ghost-on-the-menu/src/play.ts), so what they import is not known: `typeof import(…)` as a type argument (1) and other syntax (1).
- 12 writes and 15 reads use paths built at run time and are not named here.
- 12 writes and 107 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 11 commands are built at run time and not followed, 5 of them in tests.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
