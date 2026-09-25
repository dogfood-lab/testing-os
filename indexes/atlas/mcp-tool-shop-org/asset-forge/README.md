# asset-forge: how it works

Mapped at 2026-09-25 from commit 2de16f4.

## What this is

7 parts, mostly Rust (32 files), TypeScript (2) and JavaScript (1). Work enters through 2 doors; the busiest is CI, which reaches 4 parts.

## What changed since 2026-09-24 (2b8956a)

- export_all (crates/ship-export/Cargo.toml) is a new command. It runs crates/ship-export/examples/export_all.rs.
- output is now written by crates/ship-export/examples/export_all.rs.
- No file changed.

## What comes in

1. **CI.** On a pull request touching 8 paths; on a push to main touching 8 paths; or by hand. Runs crates/ship-export/src/gltf.rs, crates/ship-hull/src/caps.rs, crates/ship-hull/src/curves.rs and 15 more; checks crates/ship-export/src/lib.rs, crates/ship-hull/src/lib.rs, crates/ship-schema/src/lib.rs and 1 more.
2. **export_all** (a command people run with `cargo run --example export_all`). Runs crates/ship-export/examples/export_all.rs.

## What happens through CI

1. The workflow runs crates/ship-export/src/gltf.rs in ship-export, 12 files in ship-hull, 4 files in ship-schema, and crates/ship-testkit/tests/ in ship-testkit; it checks crates/ship-export/src/lib.rs in ship-export, crates/ship-hull/src/lib.rs in ship-hull, crates/ship-schema/src/lib.rs in ship-schema and crates/ship-testkit/src/lib.rs in ship-testkit.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**export_all** (a command people run with `cargo run --example export_all`) runs crates/ship-export/examples/export_all.rs, reaches ship-hull and ship-schema, and writes to output/, which is not tracked.

## What breaks what

- **ship-schema** is imported by 3 parts (ship-export, ship-hull, ship-testkit) and sits on the path of 2 doors.
- **ship-hull** is imported by 2 parts (ship-export, ship-testkit) and sits on the path of 2 doors.
- **ship-export** is imported only from tests, by 1 part (ship-testkit), and sits on the path of 2 doors.

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

People write .github/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → crates/ship-testkit/tests/golden_family.rs → crates/ship-hull/src/generate.rs → crates/ship-schema/src/defaults.rs

Read those in order to follow one pull request end to end. This path starts at crates/ship-testkit/tests/golden_family.rs, the test CI runs that reaches the most parts, since CI runs only tests.

## What this map cannot see

- 1 write goes to places this repository does not track, so it is not listed as generated.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
