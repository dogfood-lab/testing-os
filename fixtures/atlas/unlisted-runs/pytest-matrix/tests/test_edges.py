from app import add


def test_negative():
    assert add(-1, 1) == 0
