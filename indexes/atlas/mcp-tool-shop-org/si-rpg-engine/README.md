# si-rpg-engine: how it works

Mapped at 2026-09-24 from commit e631b2f.

## What this is

Determinism harness for a 3D RPG tick: one body, fixed quanta, one golden hash checked under three engines. (written by a person)

5 parts, mostly JavaScript (3 files). Work enters through 2 doors; the busiest is CI, which reaches 2 parts. People run write-golden.

## What changed since 2026-09-24 (73c244d)

- write-golden now also runs harness/sim.js.
- No file changed.

## What comes in

1. **CI.** On a pull request touching 5 paths; on a push to main touching 5 paths; or by hand. Checks fixtures/golden.txt and harness/sim.js.
2. **write-golden** (a command people run). Runs harness/sim.js and harness/write-golden.js.

## What happens through CI

1. The workflow checks fixtures/golden.txt in fixtures and harness/sim.js in harness.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**write-golden** (a command people run) runs harness/sim.js and harness/write-golden.js, and writes to fixtures/golden.txt.

## What breaks what

- **harness** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

No test files were found by name.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **fixtures/** is written by harness/write-golden.js.

## Hand-authored

People write .github/, docs/ and the repository root. Nothing in this repository writes to them.

## Where to start

harness/write-golden.js → fixtures/golden.txt → harness/check.js

Read those in order to follow one run of write-golden end to end. This path follows write-golden (a command people run) from its entry, since CI only checks code.

## What this map cannot see

- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
