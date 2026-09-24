# stillpoint: how it works

Mapped at 2026-09-24 from commit c7fbc27.

## What this is

7 parts, mostly TypeScript (26 files). Work enters through 2 doors; the busiest is CI, which reaches 2 parts.

## What changed since 2026-09-24 (26647ad)

Nothing structural changed since 2026-09-24; 107 files changed content.

## What comes in

1. **CI.** On a pull request touching 7 paths; on a push to main touching 7 paths; or by hand. Runs packages/server/src/engine-manager.test.ts, packages/server/src/presets.test.ts, packages/server/src/routes/api.test.ts and 3 more; checks packages/ui/src/.
2. **Deploy site to GitHub Pages.** On a pull request touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.

## What happens through CI

1. The workflow runs 6 files in server; it checks packages/ui/src/ in ui.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on a push.

## What breaks what

No part is imported by another part, and no part sits on the path of two doors.

## What tends to change together

- **packages/server/src/routes/api.test.ts** and **packages/ui/src/hooks/useRegulator.ts** changed together in 6 of 7 commits, though neither part imports the other.
- **packages/server/src/presets.ts** and **packages/ui/src/App.tsx** changed together in 5 of 6 commits, though neither part imports the other.
- **packages/server/src/routes/api.ts** and **packages/ui/src/hooks/useRegulator.ts** changed together in 6 of 8 commits, though neither part imports the other.
- **packages/server/src/routes/api.test.ts** and **packages/ui/src/App.tsx** changed together in 5 of 8 commits, though neither part imports the other.
- **packages/server/src/routes/api.ts** and **packages/ui/src/App.tsx** changed together in 5 of 9 commits, though neither part imports the other.

1 file changed together with its own test, as expected.

Confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **ui** is imported by no test.

## Written but never read

- **apps/desktop/msix/Assets/** is written by apps/desktop/msix/gen-assets.mjs and read by nothing else in this repository.
- **apps/desktop/src-tauri/icons/** is written by apps/desktop/src-tauri/gen-icons.mjs and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **apps/desktop/msix/Assets/** is written by apps/desktop/msix/gen-assets.mjs.
- **apps/desktop/src-tauri/icons/** is written by apps/desktop/src-tauri/gen-icons.mjs.

## Hand-authored

People write .claude/, .github/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → packages/server/src/index.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 2 writes and 12 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
