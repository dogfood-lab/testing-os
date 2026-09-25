import subprocess
import sys


def _run(label, cmd):
    print(f"-- {label}")
    subprocess.run(cmd, check=True)


def main():
    py = sys.executable
    pytest = [py, "-m", "pytest", "-q"]
    _run("suite", pytest)


if __name__ == "__main__":
    main()
