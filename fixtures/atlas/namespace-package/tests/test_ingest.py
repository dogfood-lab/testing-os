from pipeline import ingest


def test_register():
    assert ingest.register() == 1
