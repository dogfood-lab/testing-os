import os
from pathlib import Path


def stamp():
    (Path.home() / ".stash" / "stamp.txt").write_text("stamped")
    Path(os.getcwd(), "data", "stamp.txt").write_text("stamped")
    open(os.path.expanduser("~/.stash/log.txt"), "w").close()
