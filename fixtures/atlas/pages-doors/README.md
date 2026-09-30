# pages-doors

An Atlas regression fixture for the step shapes found on fleet Pages doors
(docs/atlas-production.spec.md, Part 7). `site/` is an Astro site whose
`build` script runs `astro build`. Each workflow builds it one way, and
each must resolve `astro build` to the site part, with the files it runs
and a reach into the site; an empty door in any of them is a regression
(maps made by Atlas 1.14.0 left such doors empty).

- `working-directory.yml`: `working-directory: site` with `npm run build`.
- `one-line.yml`: `npm ci && npm run build` on one line, in `site`.
- `prefix.yml`: `npm ci --prefix site` and `npm run build --prefix site`.
- `cd.yml`: `cd site && npm ci && npm run build`.
- `workflow-defaults.yml`: `defaults.run.working-directory` at the
  workflow's level.
- `job-defaults.yml`: `defaults.run.working-directory` at the job's level.
