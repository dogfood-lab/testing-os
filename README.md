<div align="center">

# testing-os

**Operating system for testing in the AI era**

*Protocols, evidence stores, and learning loops for AI-assisted software.*

</div>

---

## What This Is

`testing-os` is the flagship monorepo of the [Dogfood Lab](https://github.com/dogfood-lab) GitHub org. It bundles the protocols and infrastructure for running, recording, and learning from tests in an AI-native development workflow:

- A **swarm protocol** for running parallel-agent audits against a codebase.
- An **evidence store + schema spine** for the records, findings, patterns, and recommendations that come out of those runs.
- A **policy + verifier** layer that decides what counts as "verified" — and enforces it across consumer repos.
- An **intelligence layer** that turns raw findings into reusable patterns and doctrine.

It is the successor to [`mcp-tool-shop-org/dogfood-labs`](https://github.com/mcp-tool-shop-org/dogfood-labs). The old repo's tools are migrating into `packages/*` here over a series of waves; once the cutover is complete, the old repo will be archived with a redirect.

## Status

**Wave 1 — scaffold** (in progress). Workspace layout, CI, tsc/vitest plumbing.
Consumers (`repo-knowledge`, `shipcheck`, the 8 source-repo `dogfood.yml` dispatchers) still point at the old repo and continue to work normally during the cutover.

## Planned Packages

| Package | Source | Purpose |
|---------|--------|---------|
| `@dogfood-lab/schemas` | `dogfood-labs/schemas/` | The 8 JSON schemas (record, finding, pattern, recommendation, doctrine, policy, scenario, submission). |
| `@dogfood-lab/verifier` | `dogfood-labs/tools/verify/` | Central validator. Submissions pass through here before they're persisted. |
| `@dogfood-lab/findings` | `dogfood-labs/tools/findings/` | Finding contract + derive/review/synthesis/advise pipelines. |
| `@dogfood-lab/ingest` | `dogfood-labs/tools/ingest/` | Pipeline glue: dispatch → verify → persist → index. |
| `@dogfood-lab/reports` | `dogfood-labs/tools/report/` | Report builder for submissions. |
| `@dogfood-lab/portfolio` | `dogfood-labs/tools/portfolio/` | Cross-repo portfolio generator. |
| `@dogfood-lab/dogfood-swarm` | `dogfood-labs/tools/swarm/` | The 10-phase parallel-agent protocol + SQLite control plane + `swarm` bin. |

Sibling testing tools that **stay independent** but integrate via published APIs: [`shipcheck`](https://github.com/mcp-tool-shop-org/shipcheck), [`repo-knowledge`](https://github.com/mcp-tool-shop-org/repo-knowledge), [`ai-eyes-mcp`](https://github.com/mcp-tool-shop-org/ai-eyes-mcp), [`taste-engine`](https://github.com/mcp-tool-shop-org/taste-engine), [`style-dataset-lab`](https://github.com/mcp-tool-shop-org/style-dataset-lab).

## Layout

```
testing-os/
├── packages/                # Workspace packages (populated in waves 2-4)
├── swarms/                  # Swarm-run artifacts + control-plane.db (preserved from dogfood-labs)
├── indexes/                 # Generated read API: latest-by-repo.json, failing.json, stale.json
├── policies/                # Policy YAML by repo
├── records/                 # Submission landing pad
├── fixtures/                # Test/example fixtures
├── docs/                    # Contract docs + architecture notes
├── scripts/                 # Repo-level utilities
└── .github/workflows/ci.yml # Single path-driven workflow (build + test, Node 20+22)
```

## Local Development

```bash
git clone https://github.com/dogfood-lab/testing-os.git
cd testing-os
npm install
npm run build       # tsc --build across all packages
npm test            # vitest run --passWithNoTests
npm run verify      # build + test
```

Requires Node ≥ 20.

## Versioning

Lockstep across all `@dogfood-lab/*` packages. Currently `0.1.0-pre`; first stable release will be `1.0.0` once Wave 5 (data preservation + consumer cutover) lands.

## License

[MIT](LICENSE) © 2026 mcp-tool-shop

---

<div align="center">

**[All Repositories](https://github.com/orgs/dogfood-lab/repositories)** · **[Profile](https://github.com/dogfood-lab)**

*Eat first. Ship second.*

</div>
