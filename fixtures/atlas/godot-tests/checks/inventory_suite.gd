extends GdUnitTestSuite

const Inventory := preload("res://scripts/inventory.gd")

func test_starts_empty() -> void:
	assert_int(Inventory.new().count()).is_equal(0)
