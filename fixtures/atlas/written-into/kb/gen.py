import json
import sys
from pathlib import Path

KB = Path(__file__).resolve().parent


def put(name, text):
    (KB / name).write_text(text, encoding="utf8")


def main(source):
    for name, value in json.loads(Path(source).read_text(encoding="utf8")).items():
        put(name, json.dumps(value))


if __name__ == "__main__":
    main(sys.argv[1])
