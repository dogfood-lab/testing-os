from helpers import load_text, write_report
from tests.support import fake_clock


def main():
    text = load_text()
    lines = text.splitlines()
    first = lines[0].lstrip()
    fake_clock()
    write_report(first)


if __name__ == "__main__":
    main()
