from audiokit import VERSION, formats
from audiokit.render import engine


def test_names():
    assert "wav" in formats.names()
    assert engine.render("a") == "A"
    assert VERSION == "1"
