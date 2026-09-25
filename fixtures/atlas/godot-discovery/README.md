# godot-discovery

An Atlas fixture for a Godot test runner that finds its tests at run time,
the shape ai-rpg-stage's tools/headless.gd has. The runner lists
res://tests with DirAccess, keeps the names that begin with test_ and end
with .gd, and loads each. CI runs the runner with godot --script, so it
runs the two suites it finds; tests/helpers.gd is no test it finds.
