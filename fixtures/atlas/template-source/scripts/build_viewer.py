import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")


def main(month):
    tpl = open(os.path.join(ROOT, "viewer", "template.html"), encoding="utf8").read()
    with open(os.path.join(ROOT, "viewer", f"SN_{month}.html"), "w", encoding="utf8") as fh:
        fh.write(tpl.replace("{{DATA}}", month))


if __name__ == "__main__":
    main(sys.argv[1])
