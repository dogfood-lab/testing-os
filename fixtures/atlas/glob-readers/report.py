"""Prints every build log under the directory it is given."""
import glob
import os
import sys


def main(root):
    for path in sorted(glob.glob(os.path.join(root, "*.log"))):
        with open(path, encoding="utf-8") as handle:
            print(handle.read())


if __name__ == "__main__":
    main(sys.argv[1])
