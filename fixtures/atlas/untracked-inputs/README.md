# untracked-inputs

An Atlas fixture for a file a script once wrote from inputs this
repository does not keep, the shape escape-the-valley's
`event_skeletons.json` has: `scripts/convert.py` loops over a literal list
of `(prefix, path)` pairs naming `sources/events*.txt`, which are not
tracked, and writes the JSON the game loads. The script
cannot make the file again from this repository, so the committed file is
one people edit, never "Generated, never hand-edited".
