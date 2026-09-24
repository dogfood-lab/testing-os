import json
from pathlib import Path

PRIME = Path(__file__).resolve().parent.parent / "data" / "prime.json"


def main():
    if PRIME.exists():
        print(json.loads(PRIME.read_text()))
        return
    PRIME.write_text(json.dumps({}))


main()
