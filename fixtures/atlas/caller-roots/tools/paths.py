from pathlib import Path


def data_dir():
    return Path.home() / ".camp"
