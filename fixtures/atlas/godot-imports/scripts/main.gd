extends "res://scripts/base_actor.gd"

const Stats = preload("res://scripts/stats.gd")
const WORLD := "res://scenes/world.tscn"


func _ready() -> void:
	var stats = Stats.new()
	var world = load(WORLD)
	EventBus.announce("ready")
	Score.add(1)
	var items = load("res://data/items.tres")
	var art = load(path_of("bg"))
	get_tree().change_scene_to_file("res://scenes/end.tscn")


func path_of(name: String) -> String:
	return "res://art/%s.png" % name
