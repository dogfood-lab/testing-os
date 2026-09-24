extends GutTest

func test_steps() -> void:
	var player := Player.new()
	assert_eq(player.step(), 1)
