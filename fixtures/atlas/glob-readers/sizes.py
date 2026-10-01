"""Prints the size of every database under this directory."""
from pathlib import Path

HERE = Path(__file__).parent


def main():
    for path in sorted(HERE.rglob("*.db")):
        print(path.name, path.stat().st_size)


if __name__ == "__main__":
    main()
