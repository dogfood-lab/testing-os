# ai-rpg-stage: how it works

Mapped at 2026-09-24 from commit 5e9e75f.

## What this is

12 parts, mostly GDScript (36 files). Work enters through 4 doors; the busiest is the game, which reaches 3 parts. People run the game.

## What changed since 2026-09-24 (ef2f9cb)

Nothing structural changed since 2026-09-24; no file changed.

## What comes in

1. **the game** (what Godot runs). Starts stage/diorama.tscn.
2. **ci.** On a pull request touching 11 paths; on a push touching 11 paths; or by hand. Runs tools/headless.gd.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **Bump upstream pins.** On a schedule (`0 7 * * 1`), Monday at 07:00 UTC; or by hand. Runs no file this map can see.

## What happens through the game

1. The game starts stage/diorama.tscn in stage.
   1. Inside stage/diorama.gd, ready does, in order: new (SceneJoin, client), new (LightRig), new (Dressing), new (FloorPainter), attach (SpriteBinder), zone extent (FloorPainter) and new (IsoWorld).
   2. Inside stage/playable.gd, ready does, in order: new (EventBus, client), new (NetworkClient) and new (Session).
2. That reaches client (5 files) and fixtures (1 file).

## Who reads the results

The game writes nothing this map can see.

## The other doors

**ci** runs tools/headless.gd.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Bump upstream pins** runs no file this map can see, writes to .github/upstream-pins.env, commits .github/upstream-pins.env and pushes to a branch for review, never to main, and opens an issue.

## What breaks what

- **client** is imported by 1 part (stage), and by 1 more only from tests; it sits on the path of 1 door.
- **stage** is imported by 1 part (tools), and by 1 more only from tests; it sits on the path of 1 door.
- **fixtures** is imported by 1 part (stage) and sits on the path of 1 door.
- **tools** is imported only from tests, by 1 part (tests), and sits on the path of 1 door.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **assets** is imported by no test.

## Written but never read

- **.github/upstream-pins.env** is written by .github/workflows/bump-upstream-pins.yml and read by nothing else in this repository.
- **assets/dimetric/MANIFEST.json** is written by assets/dimetric/andon/build_manifest.py and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **assets/dimetric/MANIFEST.json** is written by assets/dimetric/andon/build_manifest.py.
- **assets/felt/MANIFEST.json** is written by assets/felt/synth_felt_pack.py.

## Hand-authored

People write audio/, docs/, fixtures/, the repository root and site/. Nothing in this repository writes to them.

- **.github/upstream-pins.env** is written by .github/workflows/bump-upstream-pins.yml, and by people: 5 of its 5 commits in the window are theirs.

## Where to start

.github/workflows/ci.yml → tools/headless.gd

Read those in order to follow one pull request end to end.

## What this map cannot see

- 15 reads use paths built at run time and are not named here.
- 5 writes and 2 reads go to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository.
- 2 commands are built at run time and not followed.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
