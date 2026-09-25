# sensor-humor: how it works

Mapped at 2026-09-25 from commit 53be69f.

## What this is

8 parts, mostly TypeScript (86 files), JavaScript (3), CSS (2), Astro (1), Python (1) and shell (1). Work enters through 5 doors; the busiest is Release, which reaches 4 parts. It publishes to npm and a container image. It deploys a site to GitHub Pages. People run sensor-humor.

## What changed since 2026-09-24 (6e8ea9a)

Nothing structural changed since 2026-09-24; 152 files changed content.

## What comes in

1. **Release.** When a tag matching `v*` is pushed. Runs scripts/check-pack.mjs, src/index.ts, tests/capture.test.ts and 25 more; builds src/; packs package-lock.json, package.json, tsconfig.build.json and 1 more into an image.
2. **CI.** On a pull request touching 12 paths; on a push touching 12 paths; or by hand. Runs scripts/check-pack.mjs, tests/capture.test.ts, tests/character-voice-schema.test.ts and 24 more; builds src/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **@mcptoolshop/sensor-humor** (the package's entry, which runs the command sensor-humor; it is not a library). Loads src/index.ts.
5. **sensor-humor** (a command people run). Runs src/index.ts.

## What happens through Release

1. The workflow runs scripts/check-pack.mjs in scripts, src/index.ts in src, and 26 files in tests; it builds src/ in src; it packs 4 files in the repository root into an image.
2. It publishes to npm and a container image.
3. It creates a GitHub release.

## Who reads the results

Release writes nothing this map can see.

## The other doors

**CI** runs scripts/check-pack.mjs, tests/capture.test.ts, tests/character-voice-schema.test.ts and 24 more, builds src/, and scans for secrets with TruffleHog.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**@mcptoolshop/sensor-humor** (the package's entry, which runs the command sensor-humor; it is not a library) loads src/index.ts.

**sensor-humor** (a command people run) runs src/index.ts.

## What breaks what

- **src** is imported by 1 part (scripts), and by 1 more only from tests; it sits on the path of 4 doors.
- **scripts** is imported by no other part and sits on the path of 2 doors.
- **tests** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **src/tools/heckle.ts** and **src/tools/roast.ts** changed together in 13 of 15 commits, inside the src part.
- **src/ollama.ts** and **src/tools/catchphrase.ts** changed together in 10 of 14 commits, inside the src part.
- **src/tools/comic_timing.ts** and **src/tools/roast.ts** changed together in 12 of 17 commits, inside the src part.
- **src/tools/catchphrase.ts** and **src/tools/roast.ts** changed together in 10 of 15 commits, inside the src part.
- **src/tools/catchphrase.ts** and **src/tools/comic_timing.ts** changed together in 10 of 16 commits, inside the src part.

1 file changed together with its own test, as expected.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 11 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is touched by at least one test.

scripts is touched by tests only through a spawn: a test runs its files as a child process.

verify.sh runs in no workflow.

## Written but never read

- **swarms/mcp-tool-shop-org--sensor-humor/evidence/study-swarm-feature-pass-2026-09/citation-receipt.json** is written by swarms/mcp-tool-shop-org--sensor-humor/evidence/study-swarm-feature-pass-2026-09/run-gate.mjs and read by nothing else in this repository.
- **swarms/mcp-tool-shop-org--sensor-humor/evidence/study-swarm-feature-pass-2026-09/gate-result.json** is written by swarms/mcp-tool-shop-org--sensor-humor/evidence/study-swarm-feature-pass-2026-09/run-gate.mjs and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **swarms/mcp-tool-shop-org--sensor-humor/evidence/study-swarm-feature-pass-2026-09/citation-receipt.json** is written by swarms/mcp-tool-shop-org--sensor-humor/evidence/study-swarm-feature-pass-2026-09/run-gate.mjs.
- **swarms/mcp-tool-shop-org--sensor-humor/evidence/study-swarm-feature-pass-2026-09/gate-result.json** is written by swarms/mcp-tool-shop-org--sensor-humor/evidence/study-swarm-feature-pass-2026-09/run-gate.mjs.

## Hand-authored

People write .github/, docs/, the repository root and site/; 2 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → src/index.ts → src/ollama.ts → src/types.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 import could not be resolved: `swarms/mcp-tool-shop-org--sensor-humor/evidence/study-swarm-feature-pass-2026-09/run-gate.mjs` imports `../../../../E:/AI/role-os/src/verify-citations.mjs`, which is not in this repository.
- 2 writes use paths built at run time and are not named here.
- 5 writes and 19 reads go to a path their caller passes, not to this repository.
- 3 writes and 2 reads go to the home directory (.sensor-humor/) or a path their caller passes, not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
