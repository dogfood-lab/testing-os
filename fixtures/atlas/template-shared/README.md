# template-shared

An Atlas fixture beside template-source, the shape this repository's
`indexes/` has: `scripts/build_viewer.py` reads `viewer/template.html`,
but `scripts/index_pages.py` also writes `viewer/<name>.html` and never
reads it. The file may be what that second writer writes, so the page
names no hand-written source in `viewer/`.
