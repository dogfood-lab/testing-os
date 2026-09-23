from lib.util import publish, summarize


def helper():
    publish('done')


def main():
    summarize('text')
    helper()


if __name__ == "__main__":
    main()
