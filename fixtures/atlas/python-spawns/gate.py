import subprocess
import sys


def _run(label, cmd):
    print(label)
    subprocess.run(cmd, check=True)


def main():
    py = sys.executable
    _run("typecheck", [py, "-m", "mypy", "pkg"])


if __name__ == "__main__":
    main()
