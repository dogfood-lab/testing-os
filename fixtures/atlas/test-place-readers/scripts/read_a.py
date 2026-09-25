from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
print((ROOT / "data" / "graphs.json").read_text())
