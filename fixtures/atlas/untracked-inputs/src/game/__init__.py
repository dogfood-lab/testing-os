import json
from pathlib import Path


def events():
    return json.loads((Path(__file__).parent / "data" / "events.json").read_text(encoding="utf-8"))
