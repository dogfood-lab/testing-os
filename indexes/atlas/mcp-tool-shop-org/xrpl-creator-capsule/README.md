# xrpl-creator-capsule: how it works

Mapped at 2026-09-25 from commit e2ce19a.

## What this is

12 parts, mostly TypeScript (183 files), Rust (4) and JavaScript (2). Work enters through 3 doors; the busiest is CI, which reaches 8 parts. People install the capsule-desktop desktop app.

## What changed since 2026-09-24 (1f7eeff)

- CI now also runs app/src-tauri/build.rs and app/src-tauri/src/commands.rs.
- CI now also builds app/src-tauri/src/main.rs.
- CI now also checks app/src-tauri/src/lib.rs.
- And 2 more changes to doors.
- app/src-tauri/gen/schemas/ is now written by app/src-tauri/build.rs.
- app/src-tauri/icons/128x128.png is now read by app/src-tauri/tauri.conf.json.
- app/src-tauri/icons/128x128@2x.png is now read by app/src-tauri/tauri.conf.json.
- And 8 more new writers and readers of places.
- app was authored and is now mixed.
- 263 files changed content, across 12 parts.

## What comes in

1. **CI.** On a pull request touching 13 paths; on a push touching 13 paths; when a release is published; or by hand. Runs app/scripts/bundle-bridge.mjs, verify.sh, app/bridge-worker-access.test.ts and 111 more; builds app/src-tauri/src/main.rs, packages/cli/src/, packages/core/src/ and 33 more; checks app/bridge-worker-commands.ts, app/bridge-worker.ts, app/src-tauri/src/lib.rs and 5 more.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **capsule-desktop** (the desktop app people install). Runs app/src-tauri/src/main.rs.

## What happens through CI

1. The workflow runs 65 files in app, verify.sh in the repository root, 4 files in artifacts, 22 files in cli, 8 files in core, and 14 files in 3 more parts; it checks app/bridge-worker-commands.ts, app/bridge-worker.ts and app/src-tauri/src/lib.rs in app and artifacts/ in artifacts.
2. It writes to app/src-tauri/gen/schemas/.
3. It also writes to app/src-tauri/resources/, which is not tracked.
4. It builds app/src-tauri/src/main.rs, packages/cli/src/, packages/core/src/, packages/storage/src/, packages/xaman/src/ and packages/xrpl/src/ into MSI and NSIS installers and uploads them to the release, on a release event.

## Who reads the results

- **app/src-tauri/gen/schemas/** has no reader in this repository.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**capsule-desktop** (the desktop app people install) runs app/src-tauri/src/main.rs.

## What breaks what

- **core** is imported by 4 parts (app, cli, xaman, xrpl), and by 1 more only from tests; it sits on the path of 1 door.
- **storage** is imported by 3 parts (app, cli, xrpl) and sits on the path of 1 door.
- **xrpl** is imported by 3 parts (app, artifacts, cli) and sits on the path of 1 door.
- **xaman** is imported by 1 part (cli) and sits on the path of 1 door.
- **app** is imported by no other part and sits on the path of 2 doors.
- **cli** is imported only from tests, by 1 part (artifacts), and sits on the path of 1 door.

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

- **app/src-tauri/gen/schemas/** is written by app/src-tauri/build.rs (a build script) and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **app/src-tauri/gen/schemas/** is written by app/src-tauri/build.rs (a build script).

## Hand-authored

People write .github/, artifacts/, docs/, fixtures/, the repository root and site/; 6 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → packages/cli/src/index.ts → packages/cli/src/commands/create-release.ts → packages/core/src/access-grant-validate.ts → packages/core/src/ajv-formats-interop.ts → packages/core/src/access-grant.ts → packages/core/src/validate.ts → packages/core/src/hash.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 4 imports could not be resolved: `app/bridge-worker-commands.ts` imports `xrpl`, which is not declared; `app/bridge-worker-mint-persist.test.ts` imports `xrpl`, which is not declared; `app/bridge-worker-verify-release.test.ts` imports `xrpl`, which is not declared; and 1 more.
- 6 writes and 15 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 23 writes and 37 reads go to a path their caller passes, not to this repository.
- 1 command is built at run time and not followed, and it is in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
