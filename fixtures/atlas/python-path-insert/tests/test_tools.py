import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))

import graph_lint


def test_lint():
    assert graph_lint.lint(" a ") == "a"
