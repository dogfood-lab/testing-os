extends SceneTree


func _initialize() -> void:
	var f := FileAccess.open("res://data/baked.json", FileAccess.WRITE)
	f.store_string("{}")
	var level := Resource.new()
	ResourceSaver.save(level, "res://data/level.tres")
	var copy := FileAccess.open(target_for("copy"), FileAccess.WRITE)
	quit(0)


func target_for(name: String) -> String:
	return name
