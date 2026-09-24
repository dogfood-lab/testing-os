# godot-runs

An Atlas fixture for what a workflow runs in a Godot project, the shape
ai-rpg-stage's CI has. The CI job checks this repository out into game/
beside another repository's checkout in engine/, and works from game/: it
runs a headless test runner the repository holds with the Godot binary it
downloads, runs GUT's runner on the unit tests, and lints and formats the
scripts. A step in engine/ works on the other repository. The release
exports the game with a preset export_presets.cfg names.
