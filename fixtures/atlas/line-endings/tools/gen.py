from pathlib import Path

(Path(__file__).parent / "gen.txt").write_text("generated\n")
