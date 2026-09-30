# door-toolchain

An Atlas fixture for D1, the toolchain check (docs/atlas-production.spec.md,
Part 3), in the shape of a Pages door: `site/` builds with `npm run build`,
which runs `astro build`, and its lock holds astro 7.3.3, which requires
Node >=22.12.0 and refuses to start below it.

- `pages.yml` (Deploy site) pins Node 20: it fires.
- `pages-22.yml` pins Node 22: it does not.
- `preview.yml` pins Node 20 and runs `vite build`, whose engines are
  `^20.19.0 || >=22.12.0`: 20 is any 20.x, so it does not fire.
- `lint.yml` pins Node 18 and runs `docs-lint`, a tool not on the known
  list: it fires and says only what the package declares.
- `lts.yml`, `bare.yml` and `chosen.yml` pin `lts/*`, nothing, and an
  expression: no finding, and each is listed unresolved.
- `from-file.yml` pins Node through `site/.nvmrc` (20): it fires.
- `matrix.yml` pins Node 20 and 22 on the legs of a matrix: it fires on one.
- `strict.yml` installs `strict/` on Node 22, whose `.npmrc` sets
  engine-strict and whose lock holds a package that requires Node >=24.
- `python.yml` pins Python 3.9 and installs `pylib/`, which requires
  Python >=3.10; `python-ok.yml` pins 3.12.
