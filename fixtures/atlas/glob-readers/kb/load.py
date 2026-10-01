"""Builds the two knowledge databases beside this script, and its log."""
import os
import sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))


def build():
    alpha = sqlite3.connect(os.path.join(HERE, "alpha.db"))
    alpha.execute("CREATE TABLE IF NOT EXISTS facts (id INTEGER PRIMARY KEY)")
    alpha.commit()
    beta = sqlite3.connect(os.path.join(HERE, "beta.db"))
    beta.execute("CREATE TABLE IF NOT EXISTS facts (id INTEGER PRIMARY KEY)")
    beta.commit()
    with open(os.path.join(HERE, "build.log"), "w", encoding="utf-8") as log:
        log.write("built alpha.db and beta.db\n")


if __name__ == "__main__":
    build()
