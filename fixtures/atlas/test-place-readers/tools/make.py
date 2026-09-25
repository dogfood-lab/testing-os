from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
(ROOT / "data" / "graphs.json").write_text("[]")
