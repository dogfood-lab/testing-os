from pathlib import Path


def summary():
    return "ok"


def main():
    (Path(__file__).parent / "report.txt").write_text(summary())


if __name__ == "__main__":
    main()
