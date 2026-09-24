# runforge-vscode: how it works

Mapped at 2026-09-24 from commit da77f7a.

## What this is

10 parts, mostly TypeScript (71 files). Work enters through 4 doors; CI and Build and Release each reach 3 parts, and CI is followed because a pull request goes through it. It publishes to the VS Code Marketplace. People install the runforge extension.

## What changed since 2026-09-24 (d4f816a)

- In src/extension.ts, activate lost a step, is running.
- In src/extension.ts, activate lost a step, execute run.
- In src/extension.ts, activate lost a step, show runs picker.
- And 18 more changes to the order of work.
- 221 files changed content, across 9 parts.

## What comes in

1. **CI.** On a pull request touching 12 paths; on a push to main touching 12 paths; or by hand. Runs test/browse-runs.test.ts, test/cancel-state-machine.test.ts, test/cancelled-marker-reader.test.ts and 31 more; checks src/extension.ts and test/extension-host/.
2. **Build and Release.** When a tag matching `v*` is pushed; or by hand. Runs test/browse-runs.test.ts, test/cancel-state-machine.test.ts, test/cancelled-marker-reader.test.ts and 31 more; checks src/extension.ts.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **runforge** (the extension people install from the VS Code Marketplace). Loads src/extension.ts.

## What happens through CI

1. The workflow runs 34 files in test; it checks src/extension.ts in src and test/extension-host/ in test.
2. That reaches python (18 files).

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Build and Release** runs test/browse-runs.test.ts, test/cancel-state-machine.test.ts, test/cancelled-marker-reader.test.ts and 31 more, checks src/extension.ts, reaches python, creates a GitHub release on a tag push, and publishes to the VS Code Marketplace when run by hand.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**runforge** (the extension people install from the VS Code Marketplace) loads src/extension.ts and reaches python.

## What breaks what

- **python** is run as a child process by 1 part (src) and sits on the path of 3 doors.
- **src** is imported only from tests, by 1 part (test), and sits on the path of 3 doors.
- **test** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **src/observability/export-markdown-command.ts** and **src/observability/interpretability-index-command.ts** changed together in 5 of 5 commits, inside the src part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **eslint-rules** is imported by no test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, assets/, docs/, resources/, the repository root and site/; 2 writes with paths built at run time may land here.

## Where to start

src/extension.ts

Read those in order to follow one activation of runforge end to end. This path follows runforge (the extension people install from the VS Code Marketplace) from its entry, since CI runs only tests.

## What this map cannot see

- 83 import sites could not be resolved.
- 2 writes and 16 reads use paths built at run time and are not named here.
- 9 writes and 20 reads go to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository.
- 8 commands are built at run time and not followed, 5 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
