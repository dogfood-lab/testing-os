# star-freight-client: how it works

Mapped at 2026-10-01 from commit e0bd9ea by Atlas 1.26.0.

## What this is

6 parts, mostly images (74 files) and Markdown (18); code in GDScript (4), CSS (2), TypeScript (2), Astro (1), JavaScript (1), Python (1) and shell (1). Work enters through 3 doors; the busiest is the game, which reaches 2 parts. It deploys a site to GitHub Pages. People run the game.

## What changed since 2026-10-01 (659f5b3)

Nothing structural changed since 2026-10-01; no file changed.

## What comes in

1. **the game** (what Godot runs). Starts scenes/main.tscn.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **CI.** On a pull request; on a push touching 8 paths; or by hand. Runs no file this map can see.

## What happens through the game

1. The game starts scenes/main.tscn in scenes.
2. That reaches scripts (4 files).

## Who reads the results

The game writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**CI** runs no file this map can see.

## What breaks what

- **scripts** is imported by 1 part (scenes) and sits on the path of 1 door.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

No test files were found by name.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, assets/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

scenes/main.tscn → scenes/roster.tscn → scripts/roster_scene.gd → scripts/character_node.gd → scripts/pack_loader.gd

Read those in order to follow one run of the game end to end.

## What this map cannot see

- 5 reads use paths built at run time and are not named here.
- 2 reads go to a path their caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
