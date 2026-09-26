import sys


def main():
    try:
        return int(sys.argv[1])
    except (IndexError, ValueError):
        raise SystemExit("gen needs a count")


if __name__ == "__main__":
    main()
