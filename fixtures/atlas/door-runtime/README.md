# door-runtime

An Atlas fixture for the runtime of a door (docs/atlas-production.spec.md,
Part 2). Each workflow job records the runner labels it asks for and the
platform they mean, the environment it names, and the versions its
setup-node and setup-python steps pin, with the range each can resolve to
offline; each command records the directory it starts in.

- `ci.yml` tests on a literal matrix of three GitHub-hosted runners and two
  Node versions, one of them written `22.10`, which parses as the number
  22.1.
- `pages.yml` builds `site/` on Node read from `.nvmrc` and deploys to the
  `github-pages` environment, named in its mapping form.
- `other.yml` holds what only a run can know: a runner and an environment
  spelled with an expression, a job in a container, a self-hosted runner,
  `lts/*`, and the versions `package.json` and `pyproject.toml` name.
