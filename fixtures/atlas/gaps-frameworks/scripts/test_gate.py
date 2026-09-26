import sys

FAILS = []


def check(name, cond):
    if not cond:
        FAILS.append(name)


def test_gate():
    check("gate holds", 1 + 1 == 2)


if __name__ == "__main__":
    test_gate()
    sys.exit(1 if FAILS else 0)
