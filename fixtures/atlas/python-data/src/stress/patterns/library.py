from pathlib import Path


class PatternLibrary:
    def __init__(self, patterns_dir=None):
        self.patterns_dir = patterns_dir or self._default_dir()

    @staticmethod
    def _default_dir() -> Path:
        return Path(__file__).parent / "data"


def manifest() -> Path:
    return Path(__file__).with_name("data").joinpath("manifest.json")
