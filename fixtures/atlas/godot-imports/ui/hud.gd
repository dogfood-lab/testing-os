extends CanvasLayer

func _ready() -> void:
	EventBus.announce("hud")
