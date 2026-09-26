import sys


def main(argv):
    if not argv:
        raise SystemExit('tool_c needs an argument')
    return 0


if __name__ == '__main__':
    main(sys.argv[1:])
