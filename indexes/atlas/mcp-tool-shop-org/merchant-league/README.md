# merchant-league: how it works

Mapped at 2026-11-23 from commit c077190 by Atlas 1.26.0.

## What this is

Merchant League: a slow-turn trading game for 2 to 6 players, played only on the XRPL Testnet. (written by a person)

16 parts, mostly Rust (404 files), shell (5), JavaScript (4), Python (3), CSS (2), TypeScript (2) and Astro (1). Work enters through 10 doors; the busiest is CI, which reaches 13 parts. It deploys a site to GitHub Pages. People run league-eval, league-relay, league-scorer and league-tui. xrpl is a command built from vendor/xrpl-rust (nothing ships it).

## What changed since 2026-11-23 (7195744)

Nothing structural changed since 2026-11-23; 5 files changed content.

## What comes in

1. **CI.** On a pull request; on a push to main touching 15 paths; or by hand. Runs scripts/check-audit-allowlist.mjs, scripts/check-audit-allowlist.test.mjs, scripts/check-copy.sh and 71 more; checks crates/league-eval/src/lib.rs, crates/league-eval/src/main.rs, crates/league-gen/src/lib.rs and 4 more.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **league-tui** (a command people run). Runs crates/league-tui/src/main.rs.
4. **league-eval** (a command people run). Runs crates/league-eval/src/main.rs.
5. **league-relay** (a command people run). Runs crates/league-relay/src/main.rs.
6. **league-scorer** (a command people run). Runs crates/league-scorer/src/main.rs.
7. **testnet_escrow_expiry** (a command people run with `cargo run --example testnet_escrow_expiry`). Runs crates/league-ledger/examples/testnet_escrow_expiry.rs.
8. **testnet_proof** (a command people run with `cargo run --example testnet_proof`). Runs crates/league-ledger/examples/testnet_proof.rs.
9. **testnet_requireauth** (a command people run with `cargo run --example testnet_requireauth`). Runs crates/league-ledger/examples/testnet_requireauth.rs.
10. **xrpl** (a command built from vendor/xrpl-rust, which nothing ships). Runs vendor/xrpl-rust/src/bin/xrpl.rs.

## What happens through CI

1. The workflow runs 6 files in scripts, 17 files in league-core, crates/league-error/ in league-error, 11 files in league-eval, 10 files in league-gen, and 28 files in 10 more places; it checks crates/league-eval/src/lib.rs and crates/league-eval/src/main.rs in league-eval, crates/league-gen/src/lib.rs in league-gen, crates/league-relay/src/lib.rs and crates/league-relay/src/main.rs in league-relay, and crates/league-scorer/src/lib.rs and crates/league-scorer/src/main.rs in league-scorer.
2. It writes to site/audit-report.json, which is not tracked.

## Who reads the results

CI writes only to site/audit-report.json, which is not tracked.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on main.

**league-tui** (a command people run) runs crates/league-tui/src/main.rs and reaches league-core, league-error, league-gen, league-seat-types and league-seat-ui.

**league-eval** (a command people run) runs crates/league-eval/src/main.rs and reaches league-core, league-error, league-relay and league-seat-types.

**league-relay** (a command people run) runs crates/league-relay/src/main.rs and reaches league-core, league-error and league-seat-types.

**league-scorer** (a command people run) runs crates/league-scorer/src/main.rs and reaches league-core, league-error and league-seat-types.

**testnet_escrow_expiry** (a command people run with `cargo run --example testnet_escrow_expiry`) runs crates/league-ledger/examples/testnet_escrow_expiry.rs and reaches league-error.

**testnet_proof** (a command people run with `cargo run --example testnet_proof`) runs crates/league-ledger/examples/testnet_proof.rs and reaches league-error.

**testnet_requireauth** (a command people run with `cargo run --example testnet_requireauth`) runs crates/league-ledger/examples/testnet_requireauth.rs and reaches league-error.

**xrpl** (a command built from vendor/xrpl-rust, which nothing ships) runs vendor/xrpl-rust/src/bin/xrpl.rs.

## What breaks what

- **league-core** is imported by 6 parts (league-eval, league-gen, league-relay, league-scorer, league-standalone, league-tui) and sits on the path of 5 doors.
- **league-error** is imported by 5 parts (league-core, league-ledger, league-relay, league-seat-types, league-standalone) and sits on the path of 8 doors.
- **league-seat-types** is imported by 5 parts (league-core, league-gen, league-scorer, league-seat-ui, league-tui) and sits on the path of 5 doors.
- **league-ledger** is imported by 1 part (league-standalone) and sits on the path of 4 doors.
- **league-relay** is imported by 1 part (league-eval) and sits on the path of 3 doors.
- **league-gen** is imported by 1 part (league-tui) and sits on the path of 2 doors.
- **league-seat-ui** is imported by 1 part (league-tui) and sits on the path of 2 doors.
- **league-eval** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **crates/league-eval/src/driver.rs** and **crates/league-eval/tests/play_and_branch.rs** changed together in 6 of 6 commits, inside the league-eval part.
- **crates/league-eval/src/driver.rs** and **crates/league-eval/src/records.rs** changed together in 5 of 6 commits, inside the league-eval part.
- **crates/league-eval/src/driver.rs** and **crates/league-eval/tests/addendum_item9.rs** changed together in 5 of 6 commits, inside the league-eval part.
- **crates/league-eval/src/records.rs** and **crates/league-eval/tests/play_and_branch.rs** changed together in 5 of 6 commits, inside the league-eval part.
- **crates/league-eval/tests/addendum_item9.rs** and **crates/league-eval/tests/play_and_branch.rs** changed together in 5 of 6 commits, inside the league-eval part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 11 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is touched by at least one test.

league-season is tested only by the unit tests in its own files.

league-seat-ui is tested only by the unit tests in its own files.

league-tui is tested only by the unit tests in its own files.

## Written but never read

No place is written by the files this map could read, so none goes unread; 1 file could not be.

## Helpers that look duplicated

No two parts export a helper that looks alike in the files this map could read; 1 file could not be.

## Generated, never hand-edited

Nothing in the files this map could read writes to a tracked place; 1 file could not be.

## Hand-authored

People write .github/, docs/ and the repository root; 41 writes with paths built at run time may land here.

## Where to start

crates/league-tui/src/main.rs → crates/league-core/src/lib.rs → crates/league-core/src/bot.rs → crates/league-core/src/commit.rs → crates/league-seat-types/src/lib.rs → crates/league-error/src/lib.rs

Read those in order to follow one run of league-tui end to end. This path follows league-tui (a command people run) from its entry, since CI runs only tests, scripts that import no code here and checks.

## What this map cannot see

- 1 file uses syntax the parser cannot read (crates/league-ledger/tests/vectors/LICENSE-xrpl.js), so what it imports is not known.
- 41 writes and 32 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 18 writes and 49 reads go to a path their caller passes, not to this repository.
- 2 writes go to a temporary directory, not to this repository.
- There is a Dockerfile that no workflow runs; what deploys from it does so from outside this repository, and is not on this page.
- 378 files belong to no part: site/astro.config.mjs, site/package-lock.json, site/package.json and 375 more.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
