# runforge-vscode: how it works

Mapped at 2026-09-24 from commit da77f7a.

## What this is

10 parts, mostly TypeScript (71 files). Work enters through 4 doors; the busiest is Build and Release, which reaches 2 parts.

## What changed since 2026-09-24 (d4f816a)

Nothing structural changed since 2026-09-24; 221 files changed content.

## What comes in

1. **Build and Release.** When a tag matching `v*` is pushed; or by hand. Runs test/browse-runs.test.ts, test/cancel-state-machine.test.ts, test/cancelled-marker-reader.test.ts and 31 more; checks src/extension.ts.
2. **CI.** On a pull request touching 12 paths; on a push to main touching 12 paths; or by hand. Runs test/browse-runs.test.ts, test/cancel-state-machine.test.ts, test/cancelled-marker-reader.test.ts and 31 more; checks src/extension.ts and test/extension-host/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **runforge** (the package's entry, not published from here). Loads src/extension.ts.

## What happens through Build and Release

1. The workflow runs 34 files in test; it checks src/extension.ts in src.
2. It creates a GitHub release.

## Who reads the results

Build and Release writes nothing this map can see.

## The other doors

**CI** runs test/browse-runs.test.ts, test/cancel-state-machine.test.ts, test/cancelled-marker-reader.test.ts and 31 more, and checks src/extension.ts and test/extension-host/.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**runforge** (the package's entry, not published from here) loads src/extension.ts.

## What breaks what

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

People write .github/, assets/, docs/, resources/, the repository root and site/; 7 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → test/browse-runs.test.ts → src/observability/browse-runs-command.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 83 import sites could not be resolved.
- 3 files in src use syntax the parser cannot read (src/observability/cancelled-marker-reader.ts, src/observability/orphan-markers.ts and src/observability/recover-index-command.ts), so what they import is not known: an import type followed by `[]` (3).
- 7 writes and 31 reads use paths built at run time and are not named here.
- 11 commands are built at run time and not followed, 6 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
