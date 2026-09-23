from pathlib import Path


def default_chains() -> Path:
    return Path(__file__).resolve().parent.parent / "patterns" / "data" / "chains.yaml"
