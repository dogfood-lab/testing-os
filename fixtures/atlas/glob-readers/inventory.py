"""Lists every file under the directory it is given."""
import sys
from pathlib import Path


def main(root):
    for path in sorted(Path(root).rglob("*")):
        print(path)


if __name__ == "__main__":
    main(sys.argv[1])
