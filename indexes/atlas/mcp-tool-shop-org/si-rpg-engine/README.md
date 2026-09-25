# si-rpg-engine: how it works

Mapped at 2026-09-25 from commit f84c98b.

## What this is

Deterministic 3D RPG tick: the model proposes, a checker admits, and the host draws committed frames. (written by a person)

15 parts, mostly JavaScript (58 files), TypeScript (3) and Rust (2). Work enters through 8 doors; the busiest is CI, which reaches 8 parts. host, load, play, propose, replay and write-golden are commands of a private package (nothing ships them).

## What changed since 2026-09-25 (cd21fe8)

- fixtures/drop-draft.json is now read by packages/tick/verbs.test.js.
- fixtures/pick-up-draft.json is now read by packages/tick/verbs.test.js.
- fixtures/use-draft.json is now read by packages/tick/verbs.test.js.
- 4 files added and 164 changed content, across 15 parts.

## What comes in

1. **CI.** On a pull request touching 11 paths; on a push to main touching 11 paths; or by hand. Runs harness/check.js, harness/check.test.js, harness/first-difference.js and 12 more; checks fixtures/golden-arith.txt, fixtures/golden.txt, harness/arith.mjs and 49 more.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **host** (a command of a private package, which nothing ships). Runs packages/host/bin/host.js.
4. **load** (a command of a private package, which nothing ships). Runs packages/load/bin/load.js.
5. **propose** (a command of a private package, which nothing ships). Runs packages/propose/bin/propose.js.
6. **write-golden** (a command of a private package, which nothing ships). Runs harness/sim.mjs and harness/write-golden.js.
7. **play** (a command of a private package, which nothing ships). Runs packages/tick/bin/play.js.
8. **replay** (a command of a private package, which nothing ships). Runs packages/tick/bin/replay.js.

## What happens through CI

1. The workflow runs 7 files in harness, packages/host/host.test.js in host, packages/load/load.test.js in load, packages/propose/propose.test.js in propose, solver/build.mjs in solver, and 4 files in tick; it checks fixtures/golden-arith.txt and fixtures/golden.txt in fixtures, 10 files in harness, packages/frame/frame.js, packages/frame/hash.js and packages/frame/types.d.ts in frame, packages/host/ in host, packages/load/ in load, and 27 files in 3 more places.
   1. Inside packages/propose/propose.test.js, `fresh` does, in order: `loadIntentRules` (tick), `fixtureWorld`, `createWorld`, `createMemory` and `createTick`.
   2. **`createTick`** (tick) runs, in order: `createHasher` (frame), `installMinds`, `mixMinds` and `commitFrame`.
   3. Inside packages/tick/tick.test.js, `fresh` does, in order: `fixtureWorld`, `createWorld`, `loadIntentRules`, `createMemory` and `createTick`.
   4. **`createTick`** runs, in order: `createHasher` (frame), `installMinds`, `mixMinds` and `commitFrame`.
2. It writes to solver/dist/, which is not tracked.

## Who reads the results

CI writes only to solver/dist/, which is not tracked.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**host** (a command of a private package, which nothing ships) runs packages/host/bin/host.js and reaches frame and tick.

**load** (a command of a private package, which nothing ships) runs packages/load/bin/load.js and reaches frame and tick.

**propose** (a command of a private package, which nothing ships) runs packages/propose/bin/propose.js and reaches frame and tick.

**write-golden** (a command of a private package, which nothing ships) runs harness/sim.mjs and harness/write-golden.js, reaches frame and tick, and writes to fixtures/golden-behaviour.json and fixtures/golden.txt.

**play** (a command of a private package, which nothing ships) runs packages/tick/bin/play.js and reaches frame.

**replay** (a command of a private package, which nothing ships) runs packages/tick/bin/replay.js and reaches frame.

## What breaks what

- **tick** is imported by 4 parts (harness, host, load, propose) and sits on the path of 7 doors.
- **frame** is imported by 2 parts (harness, tick) and sits on the path of 7 doors.
- **harness** is imported only from tests, by 1 part (tick), and sits on the path of 2 doors.
- **load** is imported only from tests, by 1 part (tick), and sits on the path of 2 doors.
- **host** is imported by no other part and sits on the path of 2 doors.
- **propose** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **packages/frame/types.d.ts** and **packages/tick/tick.js** changed together in 9 of 10 commits, and the tick part imports the frame part.
- **packages/propose/prompt.js** and **packages/propose/propose.test.js** changed together in 6 of 7 commits, inside the propose part.
- **packages/propose/propose.test.js** and **packages/propose/seat.js** changed together in 6 of 7 commits, inside the propose part.
- **packages/load/load.test.js** and **packages/tick/predicates.js** changed together in 5 of 6 commits, and the load part and the tick part import each other.
- **harness/sim.mjs** and **packages/tick/world.js** changed together in 9 of 12 commits, and the harness part and the tick part import each other.

1 file changed together with its own test, as expected.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 6 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **solver** is imported by no test.

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

.github/workflows/ci.yml → harness/check.js → harness/behaviour.mjs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 6 imports could not be resolved: `harness/product-run.mjs` imports `../solver/dist/solver.mjs`, which a build generates; `harness/sim.mjs` imports `../solver/dist/solver.mjs`, which a build generates; `harness/solver.test.js` imports `../solver/dist/solver.mjs`, which a build generates; and 3 more.
- 1 read uses a path built at run time and is not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 3 writes and 13 reads go to a path their caller passes, not to this repository.
- 3 writes and 9 reads go to the directory the command is run in (harness/, predicates/ and worlds/), not to this repository.
- 2 commands are built at run time and not followed.
- 19 files belong to no part: packages/tool/guard.js, site/astro.config.mjs, site/package-lock.json and 16 mores.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
