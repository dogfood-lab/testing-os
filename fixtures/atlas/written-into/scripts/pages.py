import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "site"


def main(names):
    template = (SITE / "template.html").read_text(encoding="utf8")
    for name in names:
        (SITE / f"{name}.html").write_text(template.replace("{{NAME}}", name), encoding="utf8")


if __name__ == "__main__":
    main(sys.argv[1:])
