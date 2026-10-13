import sys

from check import total


def main():
    if total([1]) != 1:
        sys.exit(1)


main()
