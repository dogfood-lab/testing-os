import subprocess
import sys

py = sys.executable


def main():
    subprocess.run([sys.executable, "-m", "pytest", "tests"], check=True)
    subprocess.run([py, "-m", "ruff", "check", "pkg"], check=True)


if __name__ == "__main__":
    main()
