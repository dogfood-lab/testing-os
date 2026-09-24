# godot-tests

An Atlas fixture for how a Godot project is tested, the shapes GUT and
gdUnit4 give it. A GUT test under test/unit/ reaches the player by its
global class; a gdUnit4 suite kept outside any test directory preloads the
inventory; a helper beside the suite is no test; one script no test
touches.
