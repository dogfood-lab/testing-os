# glob-readers

Places written by one script and read by others only through a pattern.
`kb/load.py` writes `kb/alpha.db`, `kb/beta.db` and `kb/build.log`.
`check.py` opens every `*.db` under each directory a glob of the root finds,
through a helper handed each directory, and `sizes.py` walks every `*.db`
below the root with `Path.rglob`. Both patterns are spelled in the code, so
both are readers of the two databases. `report.py` reads every `*.log` under
a directory its caller passes on the command line, which this map cannot
place, so the log is read by nothing the map can name, and the page says
that `report.py` may read it. `inventory.py` lists every file under a
directory it is handed, a pattern that spells no kind of file, so it is set
against no place. `notes/vendor.py` copies notes from packages a
glob finds in the home cache: what it writes comes from inputs this
repository does not keep, beside a note a person keeps.
