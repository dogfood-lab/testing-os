# sqlite-writes

An Atlas fixture for a database a script builds, the shape fx-dub's
knowledge base has: `kb/build_db.py` opens `kb/tool.db` with
`sqlite3.connect` and fills it, and the database is committed. The
connection writes the file, so `kb/tool.db` is written by the script; the
test that saves the file's bytes and puts them back restores it, and is
no writer of it.
