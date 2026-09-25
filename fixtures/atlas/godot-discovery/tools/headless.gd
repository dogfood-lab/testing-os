extends SceneTree

const TESTS_DIR := "res://tests"


func _initialize() -> void:
	for path: String in _discover():
		var script: Variant = load(path)
		(script as GDScript).new().run()
	quit(0)


func _discover() -> Array[String]:
	var out: Array[String] = []
	var dir := DirAccess.open(TESTS_DIR)
	if dir == null:
		return out
	dir.list_dir_begin()
	var entry := dir.get_next()
	while not entry.is_empty():
		if entry.begins_with("test_") and entry.ends_with(".gd"):
			out.append("%s/%s" % [TESTS_DIR, entry])
		entry = dir.get_next()
	return out
