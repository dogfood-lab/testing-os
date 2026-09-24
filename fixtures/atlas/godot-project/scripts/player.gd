extends Node2D

func _ready() -> void:
	EventBus.emit_signal("ready")
