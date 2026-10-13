import sys

from check import total


def main():
    if total([1, 2]) != 3:
        print("total is wrong")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
