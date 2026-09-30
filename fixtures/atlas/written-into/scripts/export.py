import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "out"


def main(source):
    for name, record in json.loads(Path(source).read_text(encoding="utf8")).items():
        (OUT / name).write_text(json.dumps(record), encoding="utf8")


if __name__ == "__main__":
    main(sys.argv[1])
