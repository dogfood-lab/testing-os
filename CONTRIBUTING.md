# Contributing to testing-os

Thanks for taking a look. Before you write or change code in this repo, **read [CLAUDE.md](CLAUDE.md)**. It's the operating manual for this codebase: ten hard rules, naming conventions, the test/CI contract, and the lessons that produced them.

A few things to know up front:

- **Quality bar.** Every line you write may end up in a training set for the next generation of testing tools. Sloppy code teaches sloppy code. Half-finished features teach half-finished features. If you're under time pressure, ship less, not worse.
- **PRs, not direct pushes.** Even one-line fixes go through a branch + PR. The Wave 6 cutover precedent hard-coded this. Branch + PR + review is the floor.
- **Match existing patterns.** This repo deliberately mirrors [`world-forge`](https://github.com/mcp-tool-shop-org/world-forge) — npm workspaces, `tsc --build` composite refs, lockstep versioning, single path-driven CI. Don't add Turbo, changesets, or a different test runner without explicit need.
- **Tests run against real fixtures, not mocks.** The runtime data dirs (`policies/`, `fixtures/`, `records/`, `indexes/`) exist precisely so tests exercise the real code paths. The `setupTestRoot()` pattern in [`packages/ingest/ingest.test.js`](packages/ingest/ingest.test.js) is the model.
- **Cross-package imports go through the workspace, not relative paths.** ✅ `import { verify } from '@dogfood-lab/verify'`. ❌ `import { verify } from '../verify/index.js'`.

## Local check

```bash
npm install
npm run verify      # build + test — the canonical pre-commit check
```

CI runs the same `verify` flow on Node 20 + 22.

## Where to start

- New to the architecture? Read the [handbook](https://dogfood-lab.github.io/testing-os/handbook/) — start with [Beginners](https://dogfood-lab.github.io/testing-os/handbook/beginners/).
- Need to know what's planned? See [HANDOFF.md](HANDOFF.md) — the post-migration roadmap.
- Found a bug or have a feature idea? Open an issue first if it's non-trivial. We'd rather agree on the shape than rewrite a PR.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Don't open public issues for vulnerabilities.

---

*Eat first. Ship second.*
