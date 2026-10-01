from . import launch
from .flags import describe


def main():
    print(describe())
    launch()


if __name__ == "__main__":
    main()
