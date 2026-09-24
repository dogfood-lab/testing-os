import tempfile
from pathlib import Path


def cache(text):
    (Path(tempfile.gettempdir()) / "songs" / "cache.json").write_text(text)
    (Path(tempfile.mkdtemp()) / "songs").mkdir()


cache("{}")
