extends Node2D

var lanterns_lit := 0


func _ready() -> void:
	light_first_lantern()


func light_first_lantern() -> void:
	lanterns_lit += 1
