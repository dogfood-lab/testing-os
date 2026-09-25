import sys

from . import __version__
from .gate import check
from .render import out

COMMANDS = {"check": check, "out": out}


def main():
    if "--version" in sys.argv:
        print(__version__)
        return
    COMMANDS[sys.argv[1]](sys.argv[2:])


if __name__ == "__main__":
    main()
