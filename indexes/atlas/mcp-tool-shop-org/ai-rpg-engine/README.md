# ai-rpg-engine: how it works

Mapped at 2026-09-23 from commit f7e56e6.

## What this is

39 parts, mostly TypeScript (797 files). Work enters through 6 doors; the busiest is CI, which reaches 35 parts. It publishes to npm and a container image. People run ai and ai-rpg-engine.

## What changed since 2026-09-23 (7ff40cd)

- CI now also runs files in docs/examples/, packages/asset-registry/src/, packages/audio-director/src/ and 34 more.
- CI runs 389 more files than before.
- Release now also runs files in packages/asset-registry/src/, packages/audio-director/src/, packages/campaign-memory/src/ and 33 more.
- And 3 more changes to doors.
- packages/ledger-adapter/scripts/live-replay-receipt.json is now written by packages/ledger-adapter/scripts/live-replay.mjs.
- packages/cli/src/package.json is now read by packages/cli/src/engine-version.ts.
- No file changed.

## What comes in

1. **CI.** On a pull request touching 15 paths; on a push touching 15 paths; or by hand. Runs scripts/check-packaging.mjs, scripts/verify-isolated-consumer.mjs, scripts/verify-mixed-game-viability.mjs and 389 more; checks docs/, eslint.config.js, packages/ and 3 more.
2. **Release.** When a release is published; or by hand. Runs scripts/check-packaging.mjs, scripts/verify-isolated-consumer.mjs, scripts/verify-mixed-game-viability.mjs and 388 more; checks docs/, eslint.config.js, packages/ and 3 more.
3. **Docs Integrity.** On a pull request touching 5 paths; on a push touching 5 paths; or by hand. Runs docs/check-docs-integrity.mjs.
4. **Deploy site to GitHub Pages.** On a pull request touching 2 paths; on a push to main touching 2 paths; or by hand. Runs no file this map can see.
5. **ai-rpg-engine** (a command people run). Runs packages/cli/src/bin.ts.
6. **ai** (a command people run). Runs packages/ollama/src/bin.ts.

## What happens through CI

1. The workflow runs 4 files in scripts, packages/asset-registry/src/file-store.test.ts, packages/asset-registry/src/hash.test.ts and packages/asset-registry/src/memory-store.test.ts in asset-registry, packages/audio-director/src/director.test.ts in audio-director, 4 files in campaign-memory, 7 files in character-creation, and 175 files in 29 more parts; it checks docs/ in docs, eslint.config.js and vitest.config.ts in the repository root, scripts/ in scripts, templates/ in starter, and packages/ (31 parts).

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs scripts/check-packaging.mjs, scripts/verify-isolated-consumer.mjs, scripts/verify-mixed-game-viability.mjs and 388 more, checks docs/, eslint.config.js, packages/ and 3 more, and publishes to npm and a container image.

**Docs Integrity** runs docs/check-docs-integrity.mjs.

**Deploy site to GitHub Pages** runs no file this map can see and deploys the site.

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

- **packages/ledger-adapter/scripts/gladiator-nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/gladiator-nft-live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/live-replay-receipt.json** is written by packages/ledger-adapter/scripts/live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/merchant-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/merchant-live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/nft-live-replay.mjs and read by nothing else in this repository.
- **packages/ledger-adapter/scripts/pirate-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/pirate-live-replay.mjs and read by nothing else in this repository.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **createGame** is exported by 13 parts (starter, starter-bounty-hunter, starter-colony, starter-cyberpunk, starter-detective and 8 more); with the same name in this many parts it is most likely a shared contract, not a copy.
- **toContentPack** is exported by packages/starter-fantasy/src/content.ts (starter-fantasy) and templates/starter/src/content.ts (starter); the two look alike.

## Generated, never hand-edited

- **packages/ledger-adapter/scripts/gladiator-nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/gladiator-nft-live-replay.mjs.
- **packages/ledger-adapter/scripts/live-replay-receipt.json** is written by packages/ledger-adapter/scripts/live-replay.mjs.
- **packages/ledger-adapter/scripts/merchant-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/merchant-live-replay.mjs.
- **packages/ledger-adapter/scripts/nft-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/nft-live-replay.mjs.
- **packages/ledger-adapter/scripts/pirate-live-replay-receipt.json** is written by packages/ledger-adapter/scripts/pirate-live-replay.mjs.

## Hand-authored

People write .claude/, .github/, docs/, dogfood/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → scripts/check-packaging.mjs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 3 import sites could not be resolved.
- 10 files use syntax the parser cannot read, so what they import is not known: 4 in modules (an import type followed by `[]`), 2 in ledger-adapter (a NUL character inside a string), 1 in cli (`typeof import(…)` as a type argument), 1 in content-schema (a NUL character inside a string), 1 in core (an import type followed by `[]`), 1 in ollama (an import type followed by `[]`).
- 42 writes and 61 reads use paths built at run time and are not named here.
- 10 commands are built at run time and not followed, 8 of them in tests.
- CI runs or checks 398 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.
- Release runs or checks 397 files and directories; the map records 200 of them, some from every directory, and walks its reach from those.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
