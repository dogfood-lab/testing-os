from conftest import run_py


def test_tool_a_needs_an_argument():
    assert run_py('tool_a.py', []).returncode != 0
