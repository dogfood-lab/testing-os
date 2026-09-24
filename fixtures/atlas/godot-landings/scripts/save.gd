extends Node

const SAVE_PATH := "user://save.json"


func write_save(data: Dictionary) -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	f.store_string(JSON.stringify(data))
	var settings := ConfigFile.new()
	settings.save("user://settings.cfg")


func read_save() -> String:
	var f := FileAccess.open("user://save.json", FileAccess.READ)
	return f.get_as_text()


func read_table() -> String:
	var f := FileAccess.open("res://data/table.json", FileAccess.READ)
	return f.get_as_text()
