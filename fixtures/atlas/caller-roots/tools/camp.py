import os
from pathlib import Path

from tools.paths import data_dir

STATE = Path(os.environ.get("CAMP_HOME") or ".camp")


def save(name, text, base=None):
    root = base or Path(".")
    (root / name).write_text(text)


def dump(args):
    Path(args.out).write_text("{}")


def here(name):
    (Path.cwd() / name).write_text("here")


def remember():
    (data_dir() / "seen.json").write_text("{}")


(STATE / "session.json").write_text("{}")
