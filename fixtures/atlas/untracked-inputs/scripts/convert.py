import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    files = [
        ("a", ROOT / "sources" / "events.txt"),
        ("b", ROOT / "sources" / "events_2.txt"),
    ]
    events = []
    for prefix, path in files:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        events.extend(f"{prefix}_{line.strip()}" for line in text.splitlines() if line.strip())
    out = ROOT / "src" / "game" / "data" / "events.json"
    out.write_text(json.dumps(events, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
