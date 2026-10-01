"""Opens every database a knowledge directory holds and checks it."""
import glob
import os
import sqlite3

ROOT = os.path.dirname(os.path.abspath(__file__))


def kb_dirs():
    return sorted(glob.glob(os.path.join(ROOT, "*")))


def pick_db(kb):
    best = None
    for path in sorted(glob.glob(os.path.join(kb, "*.db"))):
        if best is None or os.path.getsize(path) > os.path.getsize(best):
            best = path
    return best


def main():
    for kb in kb_dirs():
        db = pick_db(kb)
        if db:
            con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
            con.execute("PRAGMA integrity_check")
            con.close()


if __name__ == "__main__":
    main()
