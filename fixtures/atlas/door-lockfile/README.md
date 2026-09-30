# door-lockfile

An Atlas fixture for D2, the lockfile-platform check
(docs/atlas-production.spec.md, Part 3), in the shape of a lock written on
Windows by an npm that drops the other platforms' optional bindings
(npm/cli issue 4828). `site/package-lock.json` lists nine bindings for
`satteri` and holds only its `win32-x64` one, and holds the same shape for
five more packages; `complete/` holds every binding; `watcher/` holds a
parent whose only listed child, `fsevents`, is missing.

- `pages.yml` (Deploy site) runs `npm ci` in `site/` on `ubuntu-latest`:
  it fires once, naming six packages.
- `windows.yml` runs it on `windows-latest`: it does not.
- `matrix.yml` runs it on both: it fires once, for the Linux leg.
- `complete.yml` and `watcher.yml` run on Linux against the complete lock
  and the lone `fsevents`: neither fires.
- `own.yml` runs on a self-hosted runner: no finding, listed unresolved.

The locks are written with npm's own two-space layout.
