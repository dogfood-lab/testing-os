"""Copies the notes of every vendored package in the home cache beside this script."""
import glob
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = sorted(glob.glob(os.path.join(os.path.expanduser("~"), ".cache", "vendor-*")))


def main():
    for source in CACHE:
        with open(os.path.join(source, "NOTES.txt"), encoding="utf-8") as handle:
            text = handle.read()
        name = os.path.basename(source)
        with open(os.path.join(HERE, f"{name}.txt"), "w", encoding="utf-8") as out:
            out.write(text)


if __name__ == "__main__":
    main()
