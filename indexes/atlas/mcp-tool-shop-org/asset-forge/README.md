# asset-forge: how it works

Mapped at 2026-09-24 from commit 2de16f4.

## What this is

7 parts, mostly Rust (32 files). Work enters through 1 door; the busiest is CI, which reaches 4 parts.

## What changed since 2026-09-24 (2b8956a)

Nothing structural changed since 2026-09-24; no file changed.

## What comes in

1. **CI.** On a pull request touching 8 paths; on a push to main touching 8 paths; or by hand. Runs crates/ship-export/src/gltf.rs, crates/ship-hull/src/caps.rs, crates/ship-hull/src/curves.rs and 15 more; checks crates/ship-export/src/lib.rs, crates/ship-hull/src/lib.rs, crates/ship-schema/src/lib.rs and 1 more.

## What happens through CI

1. The workflow runs crates/ship-export/src/gltf.rs in ship-export, 12 files in ship-hull, 4 files in ship-schema, and crates/ship-testkit/tests/ in ship-testkit; it checks crates/ship-export/src/lib.rs in ship-export, crates/ship-hull/src/lib.rs in ship-hull, crates/ship-schema/src/lib.rs in ship-schema and crates/ship-testkit/src/lib.rs in ship-testkit.

## Who reads the results

CI writes nothing this map can see.

## What breaks what

- **ship-schema** is imported by 3 parts (ship-export, ship-hull, ship-testkit) and sits on the path of 1 door.
- **ship-hull** is imported by 2 parts (ship-export, ship-testkit) and sits on the path of 1 door.
- **ship-export** is imported only from tests, by 1 part (ship-testkit), and sits on the path of 1 door.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, the repository root and site/; 3 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → crates/ship-hull/src/caps.rs → crates/ship-schema/src/defaults.rs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 3 writes use paths built at run time and are not named here.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
