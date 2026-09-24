# godot-imports

An Atlas fixture for how GDScript and Godot's scenes name what they use,
the shapes ai-rpg-stage has. The main scene instances a script and a HUD
scene and reads a texture; the main script extends a script by its path,
preloads another into a const, loads a scene through a const that holds
its path, switches to a scene, loads a resource of data and one whose path
is built at run time, calls an autoload and a global class by name. A
player script extends the global class by its class_name.
