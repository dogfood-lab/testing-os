import sys


def measure(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return len(handle.read())
    except OSError:
        return -1


if __name__ == "__main__":
    print(measure(sys.argv[1]))
