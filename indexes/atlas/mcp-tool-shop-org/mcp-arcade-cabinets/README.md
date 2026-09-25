# mcp-arcade-cabinets: how it works

Mapped at 2026-09-25 from commit 745115c.

## What this is

15 parts, mostly TypeScript (156 files), JavaScript (23) and Python (6). Work enters through 6 doors; CI and Site each reach 10 parts, and CI is followed because it comes first by name. It publishes @mcptoolshop/ghost-on-the-menu (packages/launcher) and @mcptoolshop/vibe-typer (packages/launcher-vibe-typer) to npm. People run ghost-on-the-menu and vibe-typer.

## What changed since 2026-09-24 (8ebb997)

- CI now also runs apps/cabinets/src/ and apps/cabinets/vite.config.ts.
- Site now also runs apps/cabinets/src/ and apps/cabinets/vite.config.ts.
- Publish now also runs apps/cabinets/src/ and apps/cabinets/vite.config.ts.
- And 3 more changes to doors.
- packages/vibe-typer/patterns/corpus/bash.json is now written by packages/vibe-typer/scripts/port-corpus.mjs.
- packages/vibe-typer/patterns/corpus/csharp.json is now written by packages/vibe-typer/scripts/port-corpus.mjs.
- packages/vibe-typer/patterns/corpus/java.json is now written by packages/vibe-typer/scripts/port-corpus.mjs.
- And 19 more new writers and readers of places.
- 3 files changed content, across 2 parts.

## What comes in

1. **CI.** On a pull request touching 20 paths; on a push to main touching 20 paths; or by hand. Runs scripts/play.mjs, apps/cabinets/src/, apps/cabinets/test/ and 61 more; checks apps/cabinets/package.json, fixtures/tapes/, package.json and 177 more.
2. **Site.** On a pull request touching 14 paths; on a push to main touching 14 paths; or by hand. Runs apps/cabinets/src/, apps/cabinets/vite.config.ts, site/astro.config.mjs and 2 more. On main, it also runs scripts/play.mjs, apps/cabinets/test/, packages/cabinet-server/test/ and 45 more; checks packages/cabinet-server/src/index.ts, packages/cabinet-server/src/server-vibe.ts, packages/cabinet-server/src/server.ts and 175 more.
3. **Publish.** When a release is published; or by hand. Runs packages/launcher-vibe-typer/scripts/build.mjs, packages/launcher/scripts/build.mjs, scripts/play.mjs and 86 more; checks package.json, packages/cabinet-server/src/index.ts, packages/cabinet-server/src/server-vibe.ts and 176 more.
4. **cabinet-server** (a command bundled into @mcptoolshop/ghost-on-the-menu). Runs packages/cabinet-server/src/server.ts.
5. **vibe-typer** (a command people run). Runs packages/launcher-vibe-typer/src/cli.ts.
6. **ghost-on-the-menu** (a command people run). Runs packages/launcher/src/cli.ts.

## What happens through CI

1. The workflow runs scripts/play.mjs and scripts/test/ in scripts, packages/cabinet-server/test/ in cabinet-server, apps/cabinets/src/, apps/cabinets/test/ and apps/cabinets/vite.config.ts in cabinets, packages/ghost-on-the-menu/test/ in ghost-on-the-menu, packages/launcher/test/ in launcher, and 22 files in 3 more parts; it checks apps/cabinets/package.json and apps/ in cabinets, 6 files in the repository root, 8 files in scripts, voice/worker.py in voice, fixtures/tapes/ in fixtures, and packages/ (6 parts).

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Site** runs apps/cabinets/src/, apps/cabinets/vite.config.ts, site/astro.config.mjs and 2 more, runs scripts/play.mjs, apps/cabinets/test/, packages/cabinet-server/test/ and 45 more and checks packages/cabinet-server/src/index.ts, packages/cabinet-server/src/server-vibe.ts, packages/cabinet-server/src/server.ts and 175 more on main, and deploys the site on main.

**Publish** runs packages/launcher-vibe-typer/scripts/build.mjs, packages/launcher/scripts/build.mjs, scripts/play.mjs and 86 more, checks package.json, packages/cabinet-server/src/index.ts, packages/cabinet-server/src/server-vibe.ts and 176 more, and publishes @mcptoolshop/ghost-on-the-menu (packages/launcher) and @mcptoolshop/vibe-typer (packages/launcher-vibe-typer) to npm (on a run by hand, only with dry_run false).

**cabinet-server** (a command bundled into @mcptoolshop/ghost-on-the-menu) runs packages/cabinet-server/src/server.ts and reaches ghost-on-the-menu and tape-core.

**vibe-typer** (a command people run) runs packages/launcher-vibe-typer/src/cli.ts and reaches cabinet-server and launcher.

**ghost-on-the-menu** (a command people run) runs packages/launcher/src/cli.ts and reaches cabinet-server.

## What breaks what

- **tape-core** is imported by 4 parts (cabinet-server, cabinets, ghost-on-the-menu, vibe-typer) and sits on the path of 4 doors.
- **cabinet-server** is imported by 3 parts (cabinets, launcher, launcher-vibe-typer) and sits on the path of 6 doors.
- **ghost-on-the-menu** is imported by 2 parts (cabinet-server, cabinets) and sits on the path of 4 doors.
- **vibe-typer** is imported by 2 parts (cabinet-server, cabinets) and sits on the path of 3 doors.
- **launcher** is imported by 1 part (launcher-vibe-typer), and by 1 more only from tests; it sits on the path of 5 doors.
- **launcher-vibe-typer** is imported by no other part and sits on the path of 4 doors.
- **cabinets** is imported by no other part and sits on the path of 3 doors.
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
- **botFor** is exported by packages/ghost-on-the-menu/src/play.ts (ghost-on-the-menu) and packages/vibe-typer/src/play.ts (vibe-typer); the two look alike.
- **bugsIn** is exported by packages/launcher-vibe-typer/src/cli.ts (launcher-vibe-typer) and packages/launcher/src/cli.ts (launcher); the two look alike.
- **checkSeats** is exported by packages/launcher-vibe-typer/src/cli.ts (launcher-vibe-typer) and packages/launcher/src/cli.ts (launcher); the two look alike.
- **exitAfter** is exported by packages/launcher-vibe-typer/src/cli.ts (launcher-vibe-typer) and packages/launcher/src/cli.ts (launcher); the two look alike.

And 18 more pairs.

## Generated, never hand-edited

- **docs/vibe-typer.author-sample.json** has a block written by packages/vibe-typer/scripts/author.mjs.
- **docs/vibe-typer.author-sample.md** is written by packages/vibe-typer/scripts/author.mjs.
- **packages/vibe-typer/authoring/** is written by packages/vibe-typer/scripts/author.mjs.
- **packages/vibe-typer/patterns/agent.json** has a block written by packages/vibe-typer/scripts/author.mjs.
- **packages/vibe-typer/patterns/corpus/** is written by packages/vibe-typer/scripts/author.mjs.
- **packages/vibe-typer/patterns/corpus/bash.json** has a block written by packages/vibe-typer/scripts/port-corpus.mjs.
- **packages/vibe-typer/patterns/corpus/csharp.json** has a block written by packages/vibe-typer/scripts/port-corpus.mjs.
- **packages/vibe-typer/patterns/corpus/java.json** has a block written by packages/vibe-typer/scripts/port-corpus.mjs.
- **packages/vibe-typer/patterns/corpus/javascript.json** has a block written by packages/vibe-typer/scripts/port-corpus.mjs.
- **packages/vibe-typer/patterns/corpus/python.json** has a block written by packages/vibe-typer/scripts/port-corpus.mjs.
- **packages/vibe-typer/patterns/corpus/sql.json** has a block written by packages/vibe-typer/scripts/port-corpus.mjs.
- **packages/vibe-typer/patterns/levels.json** has a block written by packages/vibe-typer/scripts/author.mjs.
- **packages/vibe-typer/patterns/user.json** has a block written by packages/vibe-typer/scripts/author.mjs.

## Hand-authored

People write .github/, catalog/, fixtures/, the repository root and site/; 7 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → scripts/play.mjs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 17 import sites could not be resolved.
- 7 writes and 14 reads use paths built at run time and are not named here.
- 6 writes and 97 reads go to a path their caller passes, not to this repository.
- 5 writes and 8 reads go to the directory the command is run in (.venv/, film/ and fixtures/), not to this repository.
- 2 writes and 4 reads go to the directory the command is run in (film/, fixtures/ and packages/) or a path their caller passes, not to this repository.
- 4 writes go to a temporary directory, not to this repository.
- 6 commands are built at run time and not followed, 3 of them in tests.
- There is a Dockerfile that a workflow builds and none pushes and Docker MCP Catalog entries at catalog/server.vibe.yaml and catalog/server.yaml; what ships from them goes from outside this repository, and is not on this page.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
