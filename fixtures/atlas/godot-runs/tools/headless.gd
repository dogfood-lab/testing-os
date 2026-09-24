extends SceneTree

const TestCase := preload("res://tools/test_case.gd")

func _initialize() -> void:
	var case := TestCase.new()
	quit(0)
