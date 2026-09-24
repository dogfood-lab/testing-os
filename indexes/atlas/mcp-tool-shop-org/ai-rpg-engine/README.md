# ai-rpg-engine: how it works

Mapped at 2026-09-24 from commit f7e56e6.

## What this is

39 parts, mostly TypeScript (797 files). Work enters through 6 doors; CI and Release each reach 35 parts, and CI is followed because a pull request goes through it. It publishes workspace packages to npm and a container image. People run ai and ai-rpg-engine.

## What changed since 2026-09-23 (7ff40cd)

- CI now also runs files in docs/examples/, packages/asset-registry/src/, packages/audio-director/src/ and 34 more.
- CI runs 393 more files than before.
- Deploy site to GitHub Pages now also runs site/astro.config.mjs and site/src/.
- And 4 more changes to doors.
- docs/c0-alignment/intake-table.json is now written by packages/cli/src/c0-intake-table.test.ts.
- docs/c0-alignment/reverse-table.json is now written by packages/cli/src/c0-reverse-table.test.ts.
- docs/c0-alignment/version-skew.json is now written by packages/cli/src/c0-version-skew.test.ts.
- And 87 more new writers and readers of places.
- docs was authored and is now mixed.
- scripts/verify-isolated-consumer.mjs now starts at run; it started at publishable workspaces.
- No file changed.

## What comes in

1. **CI.** On a pull request touching 15 paths; on a push touching 15 paths; or by hand. Runs packages/cli/src/bin.ts, scripts/check-packaging.mjs, scripts/verify-isolated-consumer.mjs and 390 more; checks package-lock.json, package.json, packages/ and 21 more.
2. **Release.** When a release is published; or by hand. Runs packages/cli/src/bin.ts, scripts/check-packaging.mjs, scripts/verify-isolated-consumer.mjs and 389 more; checks package-lock.json, package.json, packages/ and 21 more.
3. **Deploy site to GitHub Pages.** On a pull request touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **Docs Integrity.** On a pull request touching 5 paths; on a push touching 5 paths; or by hand. Runs docs/check-docs-integrity.mjs.
5. **ai-rpg-engine** (a command people run). Runs packages/cli/src/bin.ts.
6. **ai** (a command people run). Runs packages/ollama/src/bin.ts.

## What happens through CI

1. The workflow runs 8 files in cli, 4 files in scripts, packages/asset-registry/src/file-store.test.ts, packages/asset-registry/src/hash.test.ts and packages/asset-registry/src/memory-store.test.ts in asset-registry, packages/audio-director/src/director.test.ts in audio-director, 4 files in campaign-memory, and 171 files in 29 more parts; it checks docs/ in docs, 5 files in the repository root, scripts/ in scripts, templates/ in starter, and packages/ (31 parts).
   1. Inside packages/cli/src/bin.ts, main does, in order:
      1. some
      2. find
      3. load external pack
      4. glyphs for (terminal-ui)
      5. close readline
      6. prompt menu
      7. read run history
      8. map
      9. format recent runs
      10. map
   2. Or, when `args.includes('--version') || args.includes('-v') || comman…`, main does close readline instead.
   3. Or, when `wantsHelp && !COMMANDS_WITH_OWN_HELP.has(command)`, main does close readline instead.
   4. Or, when `raw === undefined || raw === '' || raw.startsWith('-')`, main does map instead.
   5. Main returns early 5 more ways.
   6. **Restore session from save** runs, in order: create game, deserialize (core) and migrate module states.
2. It writes to docs/c0-alignment/intake-table.json, docs/c0-alignment/reverse-table.json and docs/c0-alignment/version-skew.json.

## Who reads the results

- **docs/c0-alignment/** has no reader in this repository.

## The other doors

**Release** runs packages/cli/src/bin.ts, scripts/check-packaging.mjs, scripts/verify-isolated-consumer.mjs and 389 more, checks package-lock.json, package.json, packages/ and 21 more, writes to docs/c0-alignment/intake-table.json, docs/c0-alignment/reverse-table.json and docs/c0-alignment/version-skew.json, and publishes workspace packages to npm and a container image (on a run by hand, only with dry_run false).

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on main.

**Docs Integrity** runs docs/check-docs-integrity.mjs and runs git.

**ai-rpg-engine** (a command people run) runs packages/cli/src/bin.ts and reaches audio-director, campaign-memory, character-creation, character-profile, content-schema, core, equipment, modules, pack-registry, presentation, sidecar, soundpack-core, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie and terminal-ui.

**ai** (a command people run) runs packages/ollama/src/bin.ts and reaches character-creation, character-profile, content-schema, core, equipment and modules.

## What breaks what

- **core** is imported by 26 parts (campaign-memory, character-creation, character-profile, cli, content-schema, docs, equipment, ledger-adapter, modules, ollama, pack-registry, sidecar, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie, terminal-ui) and sits on the path of 4 doors.
- **content-schema** is imported by 18 parts (cli, docs, modules, ollama, pack-registry, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie) and sits on the path of 4 doors.
- **equipment** is imported by 17 parts (character-profile, cli, ledger-adapter, modules, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie), and by 1 more only from tests; it sits on the path of 4 doors.
- **modules** is imported by 16 parts (cli, docs, ollama, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie), and by 4 more only from tests; it sits on the path of 4 doors.
- **character-creation** is imported by 15 parts (character-profile, cli, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie) and sits on the path of 4 doors.
- **pack-registry** is imported by 14 parts (cli, starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective, starter-fantasy, starter-gladiator, starter-merchant, starter-pirate, starter-ronin, starter-vampire, starter-weird-west, starter-zombie) and sits on the path of 3 doors.
- **presentation** is imported by 3 parts (audio-director, sidecar, terminal-ui), and by 1 more only from tests; it sits on the path of 3 doors.
- **starter-gladiator** is imported by 2 parts (cli, ledger-adapter), and by 4 more only from tests; it sits on the path of 3 doors.

## What tends to change together

- **packages/cli/src/packs-fallout-sink-consequence.test.ts** and **packages/cli/src/packs-fallout-sink.test.ts** changed together in 10 of 14 commits, inside the cli part.
- **packages/ledger-adapter/src/contracts.ts** and **packages/ledger-adapter/src/settle/adapter.ts** changed together in 11 of 16 commits, inside the ledger-adapter part.
- **packages/ollama/src/cli-run.test.ts** and **packages/ollama/src/cli.ts** changed together in 11 of 16 commits, inside the ollama part.
- **packages/ledger-adapter/src/contracts.ts** and **packages/ledger-adapter/src/settle/adapter.test.ts** changed together in 10 of 16 commits, inside the ledger-adapter part.
- **packages/ollama/src/cli-run.test.ts** and **packages/ollama/src/index.ts** changed together in 10 of 17 commits, inside the ollama part.

11 files changed together with their own tests, as expected.

Window: 180 days; a pair counts from 10 shared commits, since 56 source files reach 10 revisions; the floor falls to 3 when fewer than 20 do.

## What no test touches

- **scripts** is imported by no test.

## Written but never read

- **docs/c0-alignment/intake-table.json** is written by packages/cli/src/c0-intake-table.test.ts (a test) and read by nothing else in this repository.
- **docs/c0-alignment/reverse-table.json** is written by packages/cli/src/c0-reverse-table.test.ts (a test) and read by nothing else in this repository.
- **docs/c0-alignment/version-skew.json** is written by packages/cli/src/c0-version-skew.test.ts (a test) and read by nothing else in this repository.
- **docs/contract-v1/rng-audit.json** is written by packages/cli/src/c1-rng-audit.test.ts (a test) and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/gladiator-nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/gladiator-nft-live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/merchant-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/merchant-live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/nft-live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/pirate-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/pirate-live-replay.mjs and read by nothing else in this repository.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **createGame** is exported by 13 parts (starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective and 8 more); with the same name in this many parts it is most likely a shared contract, not a copy.
- **toContentPack** is exported by packages/starter-fantasy/src/content.ts (starter-fantasy) and templates/starter/src/content.ts (starter); the two look alike.

## Generated, never hand-edited

- **docs/c0-alignment/intake-table.json** is written by packages/cli/src/c0-intake-table.test.ts (a test).
- **docs/c0-alignment/reverse-table.json** is written by packages/cli/src/c0-reverse-table.test.ts (a test).
- **docs/c0-alignment/version-skew.json** is written by packages/cli/src/c0-version-skew.test.ts (a test).
- **docs/contract-v1/rng-audit.json** is written by packages/cli/src/c1-rng-audit.test.ts (a test).
- **packages/ledger-adapter/scripts/gladiator-nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/gladiator-nft-live-replay.mjs.
- **packages/ledger-adapter/scripts/merchant-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/merchant-live-replay.mjs.
- **packages/ledger-adapter/scripts/nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/nft-live-replay.mjs.
- **packages/ledger-adapter/scripts/pirate-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/pirate-live-replay.mjs.

## Hand-authored

People write .claude/, .github/, dogfood/, the repository root and site/; 26 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → packages/cli/src/bin.ts → packages/modules/src/ability-builders.ts → packages/content-schema/src/build-catalog.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 3 import sites could not be resolved.
- 26 writes and 35 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 36 writes and 133 reads go to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository.
- 2 commands are built at run time and not followed, 1 of them in tests.
- CI runs or checks 402 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.
- Release runs or checks 401 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
