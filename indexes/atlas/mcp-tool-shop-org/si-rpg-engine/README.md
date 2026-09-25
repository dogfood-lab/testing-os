# si-rpg-engine: how it works

Mapped at 2026-09-25 from commit 036b18d.

## What this is

Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames. (written by a person)

15 parts, mostly JavaScript (88 files), Rust (4), TypeScript (3), CSS (2), Astro (1) and HTML (1). Work enters through 9 doors; the busiest is CI, which reaches 8 parts. It deploys a site to GitHub Pages. host, load, play, propose, replay and write-golden are commands of a private package (nothing ships them).

## What changed since 2026-09-25 (39ba1fe)

- CI now also runs solver/build.rs and solver/src/rapier_law.rs.
- solver/dist is now also written by .github/workflows/ci.yml.
- fixtures/behavior-1c.json is now also read by harness/corpus.mjs.
- fixtures/behavior-3d.json is now also read by harness/corpus.mjs.
- And 12 more new writers and readers of places.
- 230 files changed content, across 15 parts.

## What comes in

1. **CI.** On a pull request touching 12 paths; on a push to main touching 12 paths; or by hand. Runs harness/bundle.mjs, harness/bundle.test.js, harness/caps.test.js and 32 more; checks fixtures/golden-arith.txt, fixtures/golden.txt, harness/arith.mjs and 62 more.
2. **Corpus.** On a schedule (`17 6 * * 1`), Monday at 06:17 UTC; or by hand. Runs harness/corpus.mjs and solver/build.mjs.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **host** (a command of a private package, which nothing ships). Runs packages/host/bin/host.js.
5. **load** (a command of a private package, which nothing ships). Runs packages/load/bin/load.js.
6. **propose** (a command of a private package, which nothing ships). Runs packages/propose/bin/propose.js.
7. **write-golden** (a command of a private package, which nothing ships). Runs harness/sim.mjs and harness/write-golden.js.
8. **play** (a command of a private package, which nothing ships). Runs packages/tick/bin/play.js.
9. **replay** (a command of a private package, which nothing ships). Runs packages/tick/bin/replay.js.

## What happens through CI

1. The workflow runs 18 files in harness, packages/host/host.test.js in host, packages/load/load.test.js in load, packages/propose/propose.test.js in propose, 6 files in solver, and 8 files in 4 more places; it checks fixtures/golden-arith.txt and fixtures/golden.txt in fixtures, 13 files in harness, packages/frame/frame.js, packages/frame/hash.js and packages/frame/types.d.ts in frame, packages/host/ in host, packages/load/ in load, and 37 files in 7 more places.
   1. Inside harness/bundle.mjs, `makeBundle` does, in order: `withRecords` and `captureBundle` (tick).
   2. Inside harness/course.test.js, `stepRun` does, in order: `recordRun` and `createWorld` (tick).
   3. Inside harness/outcome.test.js, `translatedRun` does, in order: `productInit`, `recordRun`, `createWorld` (tick), `sleepWatch` and `applyProductAct`.
   4. Inside harness/restore.test.js, `restoresAt` does, in order: `createWorld` (tick), `createHasher` (frame), `replayTo`, `expectIdentical`, `replayTo` and `expectIdentical`.
   5. **`expectIdentical`** runs, in order: `traceDifference` (tick), `withRecords`, `captureBundle` and `writeBundle`.
   6. **`expectIdentical`** runs, in order: `traceDifference` (tick), `withRecords`, `captureBundle` and `writeBundle`.
   7. Inside harness/soundness.test.js, `evict` does, in order: `createWorld` (tick) and `createHasher` (frame).
   8. Inside packages/propose/propose.test.js, `fresh` does, in order: `loadIntentRules` (tick), `fixtureWorld`, `createWorld`, `createMemory` and `createTick`.
   9. **`createTick`** (tick) runs, in order: `createHasher` (frame), `installMinds`, `mixMinds` and `commitFrame`.
   10. Inside packages/tick/order.test.js, `firstHashes` does, in order: `createWorld`, `loadIntentRules`, `createMemory` and `createTick`.
   11. **`createTick`** runs, in order: `createHasher` (frame), `installMinds`, `mixMinds` and `commitFrame`.
   12. Inside packages/tick/tick.test.js, `fresh` does, in order: `fixtureWorld`, `createWorld`, `loadIntentRules`, `createMemory` and `createTick`.
   13. **`createTick`** runs, in order: `createHasher` (frame), `installMinds`, `mixMinds` and `commitFrame`.
2. It writes to solver/dist/, which is not tracked.
3. It runs git.

## Who reads the results

CI writes only to solver/dist/, which is not tracked.

## The other doors

**Corpus** runs harness/corpus.mjs and solver/build.mjs, reaches frame and tick, writes to solver/dist/, which is not tracked, runs git, and opens an issue when it fails.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**host** (a command of a private package, which nothing ships) runs packages/host/bin/host.js and reaches frame and tick.

**load** (a command of a private package, which nothing ships) runs packages/load/bin/load.js and reaches frame and tick.

**propose** (a command of a private package, which nothing ships) runs packages/propose/bin/propose.js and reaches frame and tick.

**write-golden** (a command of a private package, which nothing ships) runs harness/sim.mjs and harness/write-golden.js, reaches frame and tick, and writes to fixtures/golden-behaviour.json and fixtures/golden.txt.

**play** (a command of a private package, which nothing ships) runs packages/tick/bin/play.js and reaches frame.

**replay** (a command of a private package, which nothing ships) runs packages/tick/bin/replay.js, reaches frame, and runs git.

## What breaks what

- **tick** is imported by 4 parts (harness, host, load, propose) and sits on the path of 8 doors.
- **frame** is imported by 2 parts (harness, tick) and sits on the path of 8 doors.
- **harness** is imported only from tests, by 1 part (tick), and sits on the path of 3 doors.
- **load** is imported only from tests, by 1 part (tick), and sits on the path of 2 doors.
- **host** is imported by no other part and sits on the path of 2 doors.
- **propose** is imported by no other part and sits on the path of 2 doors.
- **solver** is imported by no other part and sits on the path of 2 doors.
- **fixtures/golden.txt** is written by harness and read by harness and workflows, and by 2 tests; a hand edit reaches every reader.

## What tends to change together

- **packages/propose/prompt.js** and **packages/propose/propose.test.js** changed together in 6 of 7 commits, inside the propose part.
- **packages/propose/propose.test.js** and **packages/propose/seat.js** changed together in 6 of 7 commits, inside the propose part.
- **harness/bundle.test.js** and **harness/corpus.mjs** changed together in 5 of 6 commits, inside the harness part.
- **packages/frame/types.d.ts** and **packages/tick/tick.js** changed together in 9 of 11 commits, and the tick part imports the frame part.
- **packages/propose/prompt.js** and **packages/propose/seat.js** changed together in 6 of 8 commits, inside the propose part.

1 file changed together with its own test, as expected.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 9 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **reachedGoal** is exported by packages/propose/scene.js (propose) and packages/tick/scene.js (tick); the two look alike.

## Generated, never hand-edited

- **fixtures/golden-behaviour.json** has a block written by harness/write-golden.js.
- **fixtures/golden.txt** is written by harness/write-golden.js.
- **fixtures/solver.sha256** has a block written by solver/build.mjs when run without --check.

## Hand-authored

People write .github/, docs/, predicates/beliefs/, predicates/hazards/, predicates/intents/, the repository root and worlds/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → harness/bundle.mjs → packages/tick/bundle.js → packages/tick/runs.js → packages/tick/difference.js → packages/tick/trace-line.js → packages/frame/hash.js

Read those in order to follow one pull request end to end.

## What this map cannot see

- 14 imports could not be resolved: `harness/bundle.test.js` imports `../solver/dist/solver.mjs`, which a build generates; `harness/caps.test.js` imports `../solver/dist/solver.mjs`, which a build generates; `harness/corpus.mjs` imports `../solver/dist/solver.mjs`, which a build generates; and 11 more.
- 1 read uses a path built at run time and is not named here.
- 2 writes go to places this repository does not track, so they are not listed as generated.
- 7 writes and 16 reads go to a path their caller passes, not to this repository.
- 3 writes and 11 reads go to the directory the command is run in (harness/, predicates/ and worlds/), not to this repository.
- 4 writes and 1 read go to a temporary directory or a path their caller passes, not to this repository.
- 4 commands are built at run time and not followed, 1 of them in tests.
- 27 files belong to no part: packages/tool/guard.js, site/astro.config.mjs, site/package-lock.json and 24 more.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
