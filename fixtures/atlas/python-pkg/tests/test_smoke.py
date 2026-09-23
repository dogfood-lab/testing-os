import importlib.util
from pathlib import Path


def load_smoke():
    root = Path(__file__).resolve().parent.parent
    spec = importlib.util.spec_from_file_location("smoke", root / "scripts" / "smoke.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_loads():
    assert load_smoke() is not None
