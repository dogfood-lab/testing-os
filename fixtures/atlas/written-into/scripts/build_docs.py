import json
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"


def emit(name, text):
    (DOCS / name).write_text(text, encoding="utf8")


def main(source):
    for name, text in json.loads(Path(source).read_text(encoding="utf8")).items():
        emit(name, text)


if __name__ == "__main__":
    main(sys.argv[1])
