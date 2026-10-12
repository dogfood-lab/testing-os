# portlight-bounty: how it works

Mapped at 2026-10-12 from commit baff064 by Atlas 1.26.0.

## What this is

12 parts, mostly Rust (75 files), Python (12), CSS (2), JavaScript (2), TypeScript (2), Astro (1), GDScript (1), PowerShell (1) and shell (1). Work enters through 5 doors; the busiest is CI, which reaches 6 parts. It deploys a site to GitHub Pages. People run portlight. People run the game. gen_placeholders is a command built from crates/portlight-chart (nothing ships it).

## What changed since 2026-10-09 (3bea25f)

Nothing structural changed since 2026-10-09; 3 files added and 21 changed content.

## What comes in

1. **CI.** On a pull request except when only **/*.md or docs/** change; on a push to main except when only **/*.md or docs/** change; or by hand. Runs godot/scenes/harbour_seam.tscn, godot/scenes/main.tscn, tools/parity/check.py and 61 more; checks crates/portlight-chart/src/bin/gen_placeholders.rs, crates/portlight-chart/src/lib.rs, crates/portlight-cli/src/main.rs and 2 more.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **gen_placeholders** (a command built from crates/portlight-chart, which nothing ships). Runs crates/portlight-chart/src/bin/gen_placeholders.rs.
4. **portlight** (a command people run). Runs crates/portlight-cli/src/main.rs.
5. **the game** (what Godot runs). Starts godot/scenes/main.tscn.

## What happens through CI

1. The workflow runs godot/scenes/harbour_seam.tscn and godot/scenes/main.tscn in godot, 7 files in portlight-chart, 14 files in portlight-godot, 34 files in portlight-sim, and 7 files in tools; it checks crates/portlight-chart/src/bin/gen_placeholders.rs and crates/portlight-chart/src/lib.rs in portlight-chart, crates/portlight-cli/src/main.rs in portlight-cli, crates/portlight-godot/src/lib.rs in portlight-godot, and crates/portlight-sim/src/lib.rs in portlight-sim.
   1. Inside tools/parity/test_check.py, `broker_paths` does, in order: `load_divergences` and `listed`.
2. It writes to parity/golden/ and parity/saves/custom_captain_v12.json.
3. It also writes to portlight-newgame-smoke/, which is not tracked.
4. It uploads coverage to Codecov.

## Who reads the results

- **parity/** is read by tools/parity/save_slots.py.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**gen_placeholders** (a command built from crates/portlight-chart, which nothing ships) runs crates/portlight-chart/src/bin/gen_placeholders.rs and reaches portlight-sim.

**portlight** (a command people run) runs crates/portlight-cli/src/main.rs and reaches portlight-sim.

**the game** (what Godot runs) starts godot/scenes/main.tscn.

## What breaks what

- **portlight-sim** is imported by 3 parts (portlight-chart, portlight-cli, portlight-godot) and sits on the path of 3 doors.
- **portlight-chart** is imported by 1 part (portlight-godot) and sits on the path of 2 doors.
- **godot** is imported by no other part and sits on the path of 2 doors.
- **portlight-cli** is imported by no other part and sits on the path of 2 doors.
- **parity/golden/** is written by tools and read by tools; a hand edit reaches every reader.

scripts holds only PowerShell and shell files, which this map does not read, so what uses it cannot be seen.

## What tends to change together

- **crates/portlight-sim/src/script.rs** and **tools/parity/oracle.py** changed together in 7 of 9 commits, though neither part imports the other.
- **crates/portlight-sim/src/lib.rs** and **crates/portlight-sim/src/script.rs** changed together in 6 of 8 commits, inside the portlight-sim part.
- **crates/portlight-sim/src/lib.rs** and **crates/portlight-sim/src/model.rs** changed together in 5 of 7 commits, inside the portlight-sim part.
- **crates/portlight-sim/src/lib.rs** and **crates/portlight-sim/src/snapshot.rs** changed together in 5 of 7 commits, inside the portlight-sim part.
- **crates/portlight-sim/src/model.rs** and **crates/portlight-sim/src/script.rs** changed together in 5 of 7 commits, inside the portlight-sim part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 8 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **godot** is imported by no test.
- **portlight-cli** is imported by no test.
- **site** is imported by no test.

portlight-chart is tested only by the unit tests in its own files.

portlight-godot is tested only by the unit tests in its own files.

scripts holds only PowerShell and shell files, which this map does not read, so whether a test touches it cannot be seen.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **crates/portlight-sim/data/content.json** is written by tools/extract_content.py.
- **parity/golden/** is written by tools/parity/check.py.
- **parity/golden/roster_options.json** has a block written by tools/parity/roster_options.py.
- **parity/golden/victory_cases.json** has a block written by tools/parity/victory_cases.py.
- **parity/saves/custom_captain_v12.json** has a block written by tools/parity/custom_captain_save.py.

## Hand-authored

People write .github/, docs/ and the repository root; 1 write with a path built at run time may land here.

## Where to start

crates/portlight-chart/src/bin/gen_placeholders.rs → crates/portlight-chart/src/lib.rs → crates/portlight-chart/src/assets.rs → crates/portlight-sim/src/content.rs → crates/portlight-sim/data/content.json → tools/extract_content.py

Read those in order to follow one run of gen_placeholders end to end. This path follows gen_placeholders (a command built from crates/portlight-chart, which nothing ships) from its entry, since CI runs only tests, scripts that import no code here and checks.

## What this map cannot see

- 2 imports could not be resolved: `crates/portlight-sim/src/memory.rs` imports `md5::Digest`; `crates/portlight-sim/src/memory.rs` imports `md5::Md5`.
- 1 write and 14 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 7 writes and 15 reads go to a path their caller passes, not to this repository.
- 1 write and 1 read go to a temporary directory, not to this repository.
- 4 files belong to no part: playtest/README.md, playtest/_plumbing-fixture.playtest.json, playtest/portlight-godot.playtest.json and 1 more.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
