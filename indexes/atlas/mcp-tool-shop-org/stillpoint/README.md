# stillpoint: how it works

Mapped at 2026-09-25 from commit c7fbc27.

## What this is

7 parts, mostly TypeScript (26 files), JavaScript (3) and Rust (2). Work enters through 3 doors; the busiest is CI, which reaches 2 parts. stillpoint is a desktop app built from apps/desktop/src-tauri (nothing ships it).

## What changed since 2026-09-24 (26647ad)

- CI now also runs packages/ui/vite.config.ts.
- CI no longer runs packages/server/src/engine-manager.test.ts, packages/server/src/presets.test.ts, packages/server/src/state.test.ts and 1 more.
- stillpoint (apps/desktop/src-tauri/Cargo.toml) is a new desktop app. It runs apps/desktop/src-tauri/src/main.rs.
- apps/desktop/msix/layout/ is now written by apps/desktop/msix/build-msix.ps1.
- apps/desktop/msix/layout/Assets/ is now written by apps/desktop/msix/build-msix.ps1.
- apps/desktop/src-tauri/gen/schemas/ is now written by apps/desktop/src-tauri/build.rs.
- And 18 more new writers and readers of places.
- 107 files changed content, across 7 parts.

## What comes in

1. **CI.** On a pull request touching 7 paths; on a push to main touching 7 paths; or by hand. Runs packages/server/src/routes/api.test.ts, packages/server/src/routes/events.test.ts, packages/ui/src/ and 1 more.
2. **Deploy site to GitHub Pages.** On a pull request touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **stillpoint** (a desktop app built from apps/desktop/src-tauri, which nothing ships). Runs apps/desktop/src-tauri/src/main.rs.

## What happens through CI

1. The workflow runs packages/server/src/routes/api.test.ts and packages/server/src/routes/events.test.ts in server and packages/ui/src/ and packages/ui/vite.config.ts in ui.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on a push.

**stillpoint** (a desktop app built from apps/desktop/src-tauri, which nothing ships) runs apps/desktop/src-tauri/src/main.rs.

## What breaks what

- **server** is called over HTTP by 1 part (ui) and sits on the path of 1 door.
- **apps/desktop/msix/Assets/** is written by desktop and read by desktop; a hand edit reaches every reader.

## What tends to change together

- **packages/server/src/routes/api.test.ts** and **packages/ui/src/hooks/useRegulator.ts** changed together in 6 of 7 commits, and the ui part calls the server part over HTTP.
- **packages/server/src/presets.ts** and **packages/ui/src/App.tsx** changed together in 5 of 6 commits, and the ui part calls the server part over HTTP.
- **packages/server/src/routes/api.ts** and **packages/ui/src/hooks/useRegulator.ts** changed together in 6 of 8 commits, and the ui part calls the server part over HTTP.
- **packages/server/src/routes/api.test.ts** and **packages/ui/src/App.tsx** changed together in 5 of 8 commits, and the ui part calls the server part over HTTP.
- **packages/server/src/routes/api.ts** and **packages/ui/src/App.tsx** changed together in 5 of 9 commits, and the ui part calls the server part over HTTP.

1 file changed together with its own test, as expected.

Confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **ui** is imported by no test.

4 test files run in no workflow: packages/server/src/engine-manager.test.ts, packages/server/src/presets.test.ts, packages/server/src/state.test.ts and 1 more.

## Written but never read

- **apps/desktop/msix/layout/** is written by apps/desktop/msix/build-msix.ps1 and read by nothing else in this repository.
- **apps/desktop/src-tauri/gen/schemas/** is written by apps/desktop/src-tauri/build.rs (a build script) and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **apps/desktop/msix/Assets/** is written by apps/desktop/msix/gen-assets.mjs.
- **apps/desktop/msix/layout/** is written by apps/desktop/msix/build-msix.ps1.
- **apps/desktop/src-tauri/gen/schemas/** is written by apps/desktop/src-tauri/build.rs (a build script).
- **apps/desktop/src-tauri/icons/** is written by apps/desktop/src-tauri/gen-icons.mjs.

## Hand-authored

People write .claude/, .github/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → packages/server/src/server.ts → packages/server/src/routes/api.ts → packages/server/src/routes/events.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 2 writes and 12 reads go to a path their caller passes, not to this repository.
- 4 test files under `packages/server/src/` are not run by CI on Linux, where the shell expands `**` as one directory level.
- ui calls server over HTTP at 13 routes, a link no import shows: the map draws it, and no door's reach follows it.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
