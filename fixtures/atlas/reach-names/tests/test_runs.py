"""Both run.py scripts refuse no argument; tools/tool_b.py is left to a later wave."""
from conftest import run_py


def test_run_needs_an_argument():
    assert run_py('run.py', []).returncode != 0
