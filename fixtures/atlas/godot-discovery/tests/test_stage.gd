extends RefCounted

const Stage := preload("res://stage/stage.gd")


func run() -> void:
	Stage.new().play()
