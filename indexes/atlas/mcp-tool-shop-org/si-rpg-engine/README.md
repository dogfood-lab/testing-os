# si-rpg-engine: how it works

Mapped at 2026-09-26 from commit 4231c2d by Atlas 1.23.0.

## What this is

Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames. (written by a person)

16 parts, mostly JavaScript (104 files), Rust (6), TypeScript (3), CSS (2), shell (2), Astro (1) and HTML (1). Work enters through 9 doors; the busiest is CI, which reaches 8 parts. It deploys a site to GitHub Pages. host, load, play, propose, replay and write-golden are commands of a private package (nothing ships them).

## What changed since 2026-09-26 (386f0d9)

- CI now also runs solver/build.rs, solver/src/kcc.rs and solver/src/rapier_law.rs.
- solver/dist is now also written by .github/workflows/ci.yml.
- fixtures/behavior-1c.json is now also read by harness/corpus.mjs.
- fixtures/behavior-3d.json is now also read by harness/corpus.mjs.
- And 13 more new writers and readers of places.
- 320 files changed content, across 16 parts.

## What comes in

1. **CI.** On a pull request touching 12 paths; on a push to main touching 12 paths; or by hand. Runs harness/bundle.mjs, harness/bundle.test.js, harness/caps.test.js and 40 more; checks fixtures/golden-arith.txt, fixtures/golden.txt, harness/arith.mjs and 74 more.
2. **Corpus.** On a schedule (`17 6 * * 1`), Monday at 06:17 UTC; or by hand. Runs harness/corpus.mjs and solver/build.mjs.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **propose** (a command of a private package, which nothing ships). Runs packages/propose/bin/propose.js.
5. **host** (a command of a private package, which nothing ships). Runs packages/host/bin/host.js.
6. **load** (a command of a private package, which nothing ships). Runs packages/load/bin/load.js.
7. **write-golden** (a command of a private package, which nothing ships). Runs harness/sim.mjs and harness/write-golden.js.
8. **play** (a command of a private package, which nothing ships). Runs packages/tick/bin/play.js.
9. **replay** (a command of a private package, which nothing ships). Runs packages/tick/bin/replay.js.

## What happens through CI

1. The workflow runs 20 files in harness, packages/host/host.test.js in host, packages/load/load.test.js in load, packages/propose/propose.test.js and packages/propose/record.test.js in propose, 7 files in solver, and 12 files in 5 more places; it checks fixtures/golden-arith.txt and fixtures/golden.txt in fixtures, 16 files in harness, packages/frame/frame.js, packages/frame/hash.js and packages/frame/types.d.ts in frame, packages/host/ in host, packages/load/ in load, and 44 files in 7 more places.
   1. Inside harness/bundle.mjs, `makeBundle` does, in order: `withRecords` and `captureBundle` (tick).
   2. Inside harness/course.test.js, `stepRun` does, in order: `recordRun` and `createWorld` (tick).
   3. Inside harness/outcome.test.js, `translatedRun` does, in order: `productInit`, `recordRun`, `createWorld` (tick), `sleepWatch` and `applyProductAct`.
   4. Inside harness/restore.test.js, `plantedRerun` does, in order: `replayTo`, `events.mjs` (4 steps), `replayTo`, `createWorld` (tick), `createHasher` (frame), `endLine` and `endLine`.
   5. Inside harness/soundness.test.js, `evict` does, in order: `createWorld` (tick) and `createHasher` (frame).
   6. Inside harness/sweep.test.js, `sweepOf` does, in order: `loadScene` (tick) and `sweep.js` (load, 3 steps).
   7. **`loadScene`** (tick) runs, in order: `createWorld` and `beliefRefusal`.
   8. **`sweep`** (load) runs, in order: `loadIntentRules` (tick), `createWorld`, `createMemory`, `createRestorableTick` and `worldFloor`.
   9. Inside packages/propose/propose.test.js, `probeSession` does, in order:
      1. `loadRoles` (tick)
      2. `scratchWorld`
      3. `loadIntentRules`
      4. `createWorld`
      5. `createMemory`
      6. `createTick`
      7. `runSession`
      8. `settle`
      9. `writeSession`
   10. **`createTick`** (tick) runs, in order: `createHasher` (frame), `installMinds`, `mixMinds` and `commitFrame`.
   11. **`runSession`** runs, in order: `templateSlots`, `renderTemplate`, `beliefKeys` (tick), `buildSchema` and `record.js` (3 steps).
   12. Inside packages/tick/gate.test.js, `roleTick` does, in order: `catalogOf`, `loadIntentRules`, `createMemory`, `fixtureWorld`, `createWorld` and `createTick`.
   13. **`createTick`** runs, in order: `createHasher` (frame), `installMinds`, `mixMinds` and `commitFrame`.
   14. Inside packages/tick/load-hash.test.js, `snapshotAtLoad` does, in order: `createWorld` and `createHasher` (frame).
   15. Inside packages/tick/order.test.js, `firstHashes` does, in order: `createWorld`, `loadIntentRules`, `createMemory` and `createTick`.
   16. **`createTick`** runs, in order: `createHasher` (frame), `installMinds`, `mixMinds` and `commitFrame`.
   17. Inside packages/tick/tick.test.js, `fresh` does, in order: `fixtureWorld`, `createWorld`, `loadIntentRules`, `createMemory` and `createTick`.
   18. **`createTick`** runs, in order: `createHasher` (frame), `installMinds`, `mixMinds` and `commitFrame`.
2. It writes to solver/dist/, which is not tracked.
3. It runs git.

## Who reads the results

CI writes only to solver/dist/, which is not tracked.

## The other doors

**Corpus** runs harness/corpus.mjs and solver/build.mjs, reaches frame, load and tick, writes to fixtures/sweep/verdicts.json and to solver/dist/, which is not tracked, runs git, and opens an issue when it fails.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**propose** (a command of a private package, which nothing ships) runs packages/propose/bin/propose.js and reaches frame, harness and tick.

**host** (a command of a private package, which nothing ships) runs packages/host/bin/host.js and reaches frame and tick.

**load** (a command of a private package, which nothing ships) runs packages/load/bin/load.js, reaches frame and tick, and runs git.

**write-golden** (a command of a private package, which nothing ships) runs harness/sim.mjs and harness/write-golden.js, reaches frame and tick, and writes to fixtures/golden-behaviour.json and fixtures/golden.txt.

**play** (a command of a private package, which nothing ships) runs packages/tick/bin/play.js and reaches frame.

**replay** (a command of a private package, which nothing ships) runs packages/tick/bin/replay.js, reaches frame, and runs git.

## What breaks what

- **tick** is imported by 4 parts (harness, host, load, propose) and sits on the path of 8 doors.
- **frame** is imported by 2 parts (harness, tick) and sits on the path of 8 doors.
- **harness** is imported by 1 part (propose), and by 1 more only from tests; it sits on the path of 4 doors.
- **load** is imported by 1 part (harness), and by 1 more only from tests; it sits on the path of 3 doors.
- **host** is imported by no other part and sits on the path of 2 doors.
- **propose** is imported by no other part and sits on the path of 2 doors.
- **solver** is imported by no other part and sits on the path of 2 doors.
- **fixtures/golden.txt** is written by harness and read by harness and workflows, and by 3 tests; a hand edit reaches every reader.

## What tends to change together

- **harness/bundle.test.js** and **harness/corpus.mjs** changed together in 7 of 10 commits, inside the harness part.
- **packages/propose/bin/propose.js** and **packages/propose/seat.js** changed together in 9 of 13 commits, inside the propose part.
- **packages/host/host.test.js** and **packages/host/session.js** changed together in 8 of 12 commits, inside the host part.
- **packages/propose/prompt.js** and **packages/propose/seat.js** changed together in 8 of 12 commits, inside the propose part.
- **packages/propose/prompt.js** and **packages/propose/schema.js** changed together in 6 of 9 commits, inside the propose part.

2 files changed together with their own tests, as expected.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 14 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

- **fixtures/law-runs/** is written by harness/law-runs.mjs and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **fixtures/golden-behaviour.json** has a block written by harness/write-golden.js.
- **fixtures/golden.txt** is written by harness/write-golden.js.
- **fixtures/law-runs/** is written by harness/law-runs.mjs.
- **fixtures/solver.sha256** has a block written by solver/build.mjs when run without --check.
- **fixtures/sweep/verdicts.json** has a block written by harness/corpus.mjs.

## Hand-authored

People write .github/, docs/, predicates/beliefs/, predicates/hazards/, predicates/intents/, predicates/roles/, the repository root and worlds/; 2 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → harness/bundle.mjs → packages/tick/bundle.js → packages/tick/runs.js → packages/tick/difference.js → packages/tick/trace-line.js → packages/frame/hash.js

Read those in order to follow one pull request end to end.

## What this map cannot see

- 15 imports could not be resolved: `harness/bundle.test.js` imports `../solver/dist/solver.mjs`, which a build generates; `harness/caps.test.js` imports `../solver/dist/solver.mjs`, which a build generates; `harness/corpus.mjs` imports `../solver/dist/solver.mjs`, which a build generates; and 12 more.
- 2 writes and 2 reads use paths built at run time and are not named here.
- 2 writes go to places this repository does not track, so they are not listed as generated.
- 9 writes and 31 reads go to a path their caller passes, not to this repository.
- 3 writes and 14 reads go to the directory the command is run in (harness/, predicates/ and worlds/), not to this repository.
- 2 writes and 1 read go to a temporary directory or a path their caller passes, not to this repository.
- 13 commands are built at run time and not followed, 10 of them in tests.
- 32 files belong to no part: packages/tool/guard.js, site/astro.config.mjs, site/package-lock.json and 29 more.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
