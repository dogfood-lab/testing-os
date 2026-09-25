import os
import subprocess
import sys


def run(label, argv, env=None):
    print(f"-- {label}")
    subprocess.run(argv, env={**os.environ, **(env or {})}, check=True)


def main():
    py = sys.executable
    legs = [
        ("pytest", [py, "-m", "pytest", "-q"], None),
        ("pytest -O", [py, "-O", "-m", "pytest", "-q"], None),
    ]
    for label, argv, env in legs:
        run(label, argv, env=env)


if __name__ == "__main__":
    main()
