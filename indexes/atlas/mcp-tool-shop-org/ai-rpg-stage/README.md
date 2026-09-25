# ai-rpg-stage: how it works

Mapped at 2026-09-25 from commit 5e9e75f.

## What this is

12 parts, mostly GDScript (36 files), Python (8), JavaScript (2) and TypeScript (2). Work enters through 4 doors; the busiest is ci, which reaches 5 parts. People run the game.

## What changed since 2026-09-24 (ef2f9cb)

- ci now also runs tests/test_diorama.gd, tests/test_felt_juice.gd, tests/test_felt_mixer.gd and 8 more.
- fixtures/ is now written by .github/workflows/ci.yml.
- .github/upstream-pins.env is now read by .github/workflows/ci.yml.
- fixtures/world.tscn is now also read by stage/diorama.gd.
- fixtures was authored and is now generated.
- No file changed.

## What comes in

1. **ci.** On a pull request touching 11 paths; on a push touching 11 paths; or by hand. On a push, or a pull request from a fork, it runs tools/headless.gd, which runs the 11 test suites under tests/ it finds at run time.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **Bump upstream pins.** On a schedule (`0 7 * * 1`), Monday at 07:00 UTC; or by hand. Runs no file this map can see.
4. **the game** (what Godot runs). Starts stage/diorama.tscn.

## What happens through ci

1. On a push, or a pull request from a fork, it runs tools/headless.gd, which runs the 11 test suites under tests/ it finds at run time.
2. That reaches client (5 files) and stage (14 files).
3. That reaches fixtures (1 file).
4. It writes to fixtures/.

## Who reads the results

- **fixtures/** is read by stage/diorama.gd, stage/iso/iso_world.gd and tools/play.mjs, and by 2 tests.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Bump upstream pins** runs no file this map can see, writes to .github/upstream-pins.env, commits .github/upstream-pins.env and pushes to a branch for review, never to main, and opens an issue.

**the game** (what Godot runs) starts stage/diorama.tscn and reaches client and fixtures.

## What breaks what

- **client** is imported by 1 part (stage), and by 1 more only from tests; it sits on the path of 2 doors.
- **stage** is imported by 1 part (tools), and by 1 more only from tests; it sits on the path of 2 doors.
- **fixtures** is imported by 1 part (stage) and sits on the path of 2 doors.
- **tools** is imported only from tests, by 1 part (tests), and sits on the path of 1 door.
- **fixtures/** is written by .github and read by stage and tools; a hand edit reaches every reader.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **assets** is imported by no test.

## Written but never read

- **assets/dimetric/MANIFEST.json** is written by assets/dimetric/andon/build_manifest.py and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **assets/dimetric/MANIFEST.json** is written by assets/dimetric/andon/build_manifest.py.
- **assets/felt/MANIFEST.json** is written by assets/felt/synth_felt_pack.py.
- **fixtures/** is written by .github/workflows/ci.yml.

## Hand-authored

People write audio/, docs/, the repository root and site/. Nothing in this repository writes to them.

- **.github/upstream-pins.env** is written by .github/workflows/bump-upstream-pins.yml, and by people: 5 of its 5 commits in the window are theirs.

## Where to start

.github/workflows/ci.yml → tools/headless.gd

Read those in order to follow one push, or pull request from a fork, end to end.

## What this map cannot see

- 14 reads use paths built at run time and are not named here.
- 5 writes and 2 reads go to a path their caller passes, not to this repository.
- 2 commands are built at run time and not followed.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
