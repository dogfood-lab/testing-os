from tools.report import summary


def test_summary():
    assert summary() == "ok"
