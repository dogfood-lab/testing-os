# template-source

An Atlas fixture for a directory a script builds from a template kept in
it, the shape schumann-surface's viewer has: `scripts/build_viewer.py`
reads `viewer/template.html` and writes month pages under `viewer/` named
`SN_<month>.html`, the month read at run time. The pages have a shape the
template does not, so the write lands on `viewer/SN_*.html`, and the
template, which people write, is no part of what the script writes.
