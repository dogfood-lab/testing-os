import os
import sqlite3

DB = os.path.join(os.path.dirname(__file__), "tool.db")


def main():
    c = sqlite3.connect(DB)
    c.execute("create table if not exists notes (text)")
    c.commit()
    c.close()


if __name__ == "__main__":
    main()
