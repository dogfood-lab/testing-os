from pathlib import Path


def test_graphs():
    assert (Path(__file__).resolve().parent.parent / "data" / "graphs.json").read_text()
