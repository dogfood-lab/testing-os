# written-into

An Atlas fixture for writers that put files into a tracked directory under
names they read at run time, beside files they do not make. A directory is
said to be written only when every tracked file in it is one its writers
can make; otherwise the page says it holds files they write.

- kb/gen.py writes `KB / name` for a name its caller reads from an input
  file, into kb/, which also holds the writer itself and notes.md, a page
  people write. kb/ holds files kb/gen.py writes; it is not written.
- scripts/build_docs.py writes `DOCS / name` into docs/, whose guide/intro.md
  one directory below is no file a single name makes. docs/ holds files it
  writes.
- scripts/export.py writes `OUT / name` into out/, which holds nothing else:
  out/ is written by it.
- scripts/persist.mjs writes store/<org>/<id>.json, or the same under
  store/_rejected/: store/ holds nothing else, and a file under
  store/_rejected/ is one the rejected write makes, so store/ is written
  by it.
- scripts/tune.mjs writes tuning/matrix-<label>.json from the directory it is
  run in, beside WAVE_1_OUTCOMES.md: the files of that shape are written,
  and the notes are not.
- scripts/pages.py reads site/template.html and writes site/<name>.html: the
  template has the shape of its output, so site/ is written by it, except
  the template, which it reads and people write.
