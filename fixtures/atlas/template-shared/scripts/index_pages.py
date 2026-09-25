import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")


def main(name):
    with open(os.path.join(ROOT, "viewer", f"{name}.html"), "w", encoding="utf8") as fh:
        fh.write("<p>index</p>")


if __name__ == "__main__":
    main(sys.argv[1])
