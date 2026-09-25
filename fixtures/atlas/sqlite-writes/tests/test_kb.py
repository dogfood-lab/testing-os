import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "kb", "tool.db")
_ORIGINAL = None


def setUpModule():
    global _ORIGINAL
    with open(DB_PATH, "rb") as fh:
        _ORIGINAL = fh.read()


def tearDownModule():
    with open(DB_PATH, "wb") as fh:
        fh.write(_ORIGINAL)


def test_exists():
    assert os.path.exists(DB_PATH)
