# xrpl-creator-capsule: how it works

Mapped at 2026-09-24 from commit e2ce19a.

## What this is

12 parts, mostly TypeScript (183 files). Work enters through 3 doors; the busiest is CI, which reaches 8 parts. People run capsule.

## What changed since 2026-09-24 (1f7eeff)

- app/src-tauri/icons/128x128.png is now read by app/src-tauri/tauri.conf.json.
- app/src-tauri/icons/128x128@2x.png is now read by app/src-tauri/tauri.conf.json.
- app/src-tauri/icons/32x32.png is now read by app/src-tauri/tauri.conf.json.
- And 3 more new writers and readers of places.
- 263 files changed content, across 12 parts.

## What comes in

1. **CI.** On a pull request touching 13 paths; on a push touching 13 paths; when a release is published; or by hand. Runs app/scripts/bundle-bridge.mjs, verify.sh, app/bridge-worker-access.test.ts and 75 more; checks app/bridge-worker-commands.ts, app/bridge-worker.ts, app/src/ and 116 more.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **capsule** (a command people run). Runs packages/cli/src/bin.ts.

## What happens through CI

1. The workflow runs 29 files in app, verify.sh in the repository root, 4 files in artifacts, 22 files in cli, 8 files in core, and 14 files in 3 more parts; it checks 56 files in app, artifacts/ in artifacts, packages/cli/src/ in cli, packages/core/src/ in core, packages/storage/src/ in storage, and 25 files in 2 more parts.
2. It creates a GitHub release on a release event.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**capsule** (a command people run) runs packages/cli/src/bin.ts and reaches core, storage, xaman and xrpl.

## What breaks what

- **core** is imported by 4 parts (app, cli, xaman, xrpl), and by 1 more only from tests; it sits on the path of 2 doors.
- **storage** is imported by 3 parts (app, cli, xrpl) and sits on the path of 2 doors.
- **xrpl** is imported by 3 parts (app, artifacts, cli) and sits on the path of 2 doors.
- **xaman** is imported by 1 part (cli) and sits on the path of 2 doors.
- **cli** is imported only from tests, by 1 part (artifacts), and sits on the path of 2 doors.

## What tends to change together

- **app/bridge-worker.ts** and **app/src/bridge/engine.ts** changed together in 5 of 7 commits, inside the app part.
- **app/src/components/panels/MintPanel.tsx** and **app/src/components/panels/PanelShell.tsx** changed together in 4 of 6 commits, inside the app part.
- **app/src/bridge/engine.ts** and **app/src/state/release.tsx** changed together in 6 of 10 commits, inside the app part.
- **app/src/bridge/engine.ts** and **app/src/components/panels/MintPanel.tsx** changed together in 4 of 7 commits, inside the app part.
- **packages/cli/src/bin.ts** and **packages/core/src/index.ts** changed together in 5 of 9 commits, and the cli part imports the core part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

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

People write .github/, artifacts/, docs/, fixtures/, the repository root and site/; 2 writes with paths built at run time may land here.

## Where to start

packages/cli/src/bin.ts → packages/core/src/access-grant-schema.ts

Read those in order to follow one run of capsule end to end. This path follows capsule (a command people run) from its entry, since CI runs only tests and scripts that import no code here.

## What this map cannot see

- 4 import sites could not be resolved.
- 2 writes and 14 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 22 writes and 37 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 1 command is built at run time and not followed, and it is in tests.
- There is a Tauri app under app/ (4 Rust files) that a workflow builds; the map reads no Rust, so what its Rust code does is not on this page.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
