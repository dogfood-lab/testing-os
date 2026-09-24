# godot-landings

An Atlas fixture for what a Godot script writes and reads, the shape a
game's save and a baking tool have. The save script writes and reads the
player's save and settings under user://, reads a table of the project by
its res:// path, bakes a table and a level resource into data/, and writes
one file whose path is built at run time. A workflow runs the baking tool.
