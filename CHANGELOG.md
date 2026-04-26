# Changelog

All notable changes to `testing-os` are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] — 2026-04-25

Bug fix release. Two Stage D dispatch blockers shipped in v1.1.0 caught at first dispatch (no agents ran yet):

### Fixed

- **`lib/output-schema.js`** — `validateAuditOutput` stage enum was hardcoded `['A', 'B', 'C']`. Stage D outputs (stage = 'D') failed validation, causing `swarm collect` to reject every audit row even though dispatch and prompt generation succeeded. Enum extended to `['A', 'B', 'C', 'D']`. Error message updated. Validator now accepts Stage D outputs.
- **`lib/templates.js`** — JSON output template extracted stage letter via `opts.phase.split('-').pop().toUpperCase()`. The naming convention isn't symmetric: `health-audit-{a,b,c}` puts the letter last, but `stage-d-{audit,amend}` puts the action last. For phase `stage-d-audit` the extraction returned `'AUDIT'`, not `'D'`. Replaced with explicit `PHASE_TO_STAGE` map keyed on phase name. Documented inline why the symmetry break exists.

Both bugs are the same B.7 blind-spot pattern (`memory/feedback_intra_workspace_downstream_audit.md`) that motivated v1.1.0: Stage D added at protocol-spec layer, downstream code that depends on phase strings didn't follow. The v1.1.0 patch covered the obvious downstream (PHASE_MAP, AUDIT_PHASES, AMEND_PHASES, FINDING_GATED_PHASES, CLI help) but missed the validator's stage enum and the template's stage-letter extraction. Both now have explicit test coverage in `control-plane.test.js`.

### Added

- **Stage D prompt template test** — `buildAuditPrompt({phase: 'stage-d-audit'})` asserted to embed `"stage": "D"` in the JSON output schema.
- **Stage D validator test** — `validateAuditOutput({stage: 'D', ...})` asserted to accept (parallel to existing A/B/C tests).
- **PHASE_TO_STAGE map** — explicit phase-name → stage-letter table in `lib/templates.js`. Future phase additions update the map alongside the validator's stage enum (single change, two-side update).

### Notes

- 178 tests pass in `@dogfood-lab/dogfood-swarm` (was 176 in v1.1.0). Net +2 tests for Stage D regression coverage.
- No behavioral change for existing Stage A/B/C consumers; Stage D consumers were broken pre-v1.1.1 and now work.

## [1.1.0] — 2026-04-25

Stage D Visual Polish becomes a first-class phase in the swarm protocol. Added at the protocol-spec layer (`memory/dogfood-swarm.md`) on 2026-04-25 after the runforge-vscode v1.1.0 swarm exposed the Stage C gap; this release propagates the spec into the `@dogfood-lab/dogfood-swarm` CLI implementation so consumers can dispatch `stage-d-audit` / `stage-d-amend` as recognized phases. Receipts from the first reference run land at `swarms/mcp-tool-shop-org--runforge-vscode/stage-d/`.

### Added

- **`stage-d-audit` + `stage-d-amend` phases** in `packages/dogfood-swarm/`. Recognized by `swarm dispatch`, `swarm collect`, `swarm advance`, and `swarm resume`.
- **Visual Polish lens** in `packages/dogfood-swarm/lib/templates.js` (`STAGE_LENS['stage-d-audit']`). Mirrors the canonical bullet list from `memory/dogfood-swarm.md` verbatim — typography/spacing/layout, iconography & assets, color/theming/dark-mode, animated demonstrations, command palette presentation, status bar integration, first-run welcome, settings UI grouping, marketplace listing visuals.
- **Stage D in `FINDING_GATED_PHASES`** (`lib/advance.js`). HIGH/CRITICAL visual findings block advance, same severity rigor as bug fixes.
- **CLI help + error messages** updated to list the new phases.
- **`advance.test.js`** coverage: PHASE_MAP includes `stage-d-{audit,amend}`, finding-gating asserted, multi-phase progression test extended to `health-audit-a → b → c → stage-d-audit → feature-audit`.

### Changed

- **`PHASE_MAP` restructured** to slot Stage D between the health pass and feature pass. `health-audit-c.next` flips from `feature-audit` to `stage-d-audit`. `stage-d-audit.next` is `feature-audit`. The amend lane returns: `stage-d-amend.next = stage-d-audit`. Existing health and feature transitions are unchanged.
- **`health-audit-c` (Humanization) lens copy** now explicitly scopes itself to BEHAVIORAL polish (text, behavior, accessibility-of-content) and points readers at Stage D for visual polish. Prevents the "Stage C interpreted as covering visual" gap that triggered Stage D's creation.

### Notes

- Backward-compatible: existing runs that have already promoted past `health-audit-c` still advance normally. New runs flow through Stage D before reaching `feature-audit`.
- Cross-references: pattern #18 in `memory/dogfood-swarm.md`; runforge-vscode `swarms/mcp-tool-shop-org--runforge-vscode/stage-d/` is the reference run for future Stage D dispatches.

## [1.0.0] — 2026-04-25

First stable release. The migration from `mcp-tool-shop-org/dogfood-labs` is complete and the post-migration polish in [HANDOFF.md](HANDOFF.md) sessions A–G has shipped. Consumers can now pin to `^1.0.0` confidently.

### Added

- **`@dogfood-lab/schemas`** — TypeScript package with the 8 JSON schemas (record, finding, pattern, recommendation, doctrine, policy, scenario, submission). 5 vitest tests.
- **`@dogfood-lab/verify`** — central submission validator (290 `node:test` tests across the JS packages).
- **`@dogfood-lab/findings`** — finding contract + derive/review/synthesis/advise pipelines.
- **`@dogfood-lab/ingest`** — pipeline glue: dispatch → verify → persist → indexes.
- **`@dogfood-lab/report`** — submission builder for source repos.
- **`@dogfood-lab/portfolio`** — cross-repo portfolio generator.
- **`@dogfood-lab/dogfood-swarm`** — 10-phase parallel-agent protocol + SQLite control plane + `swarm` CLI bin (173 tests).
- **`.github/workflows/ingest.yml`** — receives `repository_dispatch` of type `dogfood_submission` from consumers, runs the ingest pipeline, commits new records and indexes back to `main`. Concurrency-safe (per-repo group, no cancel-in-progress) with retry-on-conflict push loop.
- **`.github/workflows/pages.yml`** — builds and deploys the Astro Starlight handbook to [dogfood-lab.github.io/testing-os/](https://dogfood-lab.github.io/testing-os/). Includes a verify-200 curl loop that fails the deploy on stale CDN.
- **`site/`** — Astro Starlight handbook with 7 pages (architecture, beginners, contracts, integration, intelligence layer, operating guide, and the index landing). Migrated from the legacy repo with full link rewrites for the new layout.
- **README.md badges + version-sync block** — CI, Pages, License, Node ≥ 20 badges; `<!-- version:start -->` block auto-stamped from `package.json` via `scripts/sync-version.mjs` (runs as `prebuild`).
- **`CONTRIBUTING.md`** — points at `CLAUDE.md` as the operating manual.
- **`SHIP_GATE.md`** + **`SCORECARD.md`** — `shipcheck`-driven product standards. Hard gates A–D pass at 100%.
- **README.md threat model paragraph** — what this code touches, what it doesn't, permissions required, telemetry posture.
- **Logo** at `assets/logo.png` and `site/public/logo.png` — wired into the README header and the handbook's Starlight chrome.
- **7 README translations** (ja, zh, es, fr, hi, it, pt-BR) via polyglot-mcp's `translate-all.mjs`. Language nav bar at the top of every variant.
- **GitHub repo metadata** — description, homepage, topics (`ai-tooling`, `dogfood-lab`, `mcp-tool-shop`, `monorepo`, `npm-workspaces`, `testing`).

### Changed

- All 8 JSON schemas (`packages/schemas/src/json/*.json`) now have `$id` URLs pointing at the canonical monorepo location: `https://github.com/dogfood-lab/testing-os/packages/schemas/src/json/<name>.schema.json`. Replaces the legacy `mcp-tool-shop-org/dogfood-labs/schemas/...` URLs.
- npm scope `@dogfood-labs/*` (legacy, plural) is retired; everything is `@dogfood-lab/*` (singular).
- HANDOFF.md tracks Sessions A–G as complete; Session H (legacy-repo deletion) is gated on Mike's explicit approval and a 30-day grace window per the doc.

### Deprecated

- The legacy repo `mcp-tool-shop-org/dogfood-labs` is **archived** (read-only). Its raw URLs continue to serve until Session H deletes the repo.
- `repo-knowledge`'s back-compat fallback for `tools/findings/cli.js` (legacy layout) remains intentional until Session H confirms no callers depend on it.

### Verified end-to-end (Session A)

- Consumer dogfood (`mcp-tool-shop-org/claude-guardian`) → manual dispatch (because consumer `DOGFOOD_TOKEN` secret is missing — tracked as a follow-up) → `ingest.yml` run [24922250743](https://github.com/dogfood-lab/testing-os/actions/runs/24922250743) → record [`records/mcp-tool-shop-org/claude-guardian/2026/04/25/run-claude-guardian-24922209099-1.json`](records/mcp-tool-shop-org/claude-guardian/2026/04/25/run-claude-guardian-24922209099-1.json) → `latest-by-repo.json` updated → `shipcheck dogfood` exits 0 → `repo-knowledge sync-dogfood` populates 91 facts.

### Known follow-ups

- `DOGFOOD_TOKEN` secret missing on every consumer repo — dispatch step skips with a warning. User-side action.
- ai-loadout `main` build is broken (`tsc` errors on missing `@types/node`); independent of this migration.
- All pinned action SHAs (`actions/checkout@34e1148`, `actions/setup-node@49933ea`, etc.) are Node 20 — GitHub deprecates Node 20 by 2026-09-16.
- `site/` `npm audit` reports 8 vulnerabilities (5 moderate, 3 high) inherited from the legacy lockfile; not blocking deployment.
- Workspace dep scanning + Dependabot config not yet wired into CI; tracked under SHIP_GATE.md hygiene SKIPs.
- All 7 packages are `private: true`. The `npm publish` decision is deferred per HANDOFF.md Session G.

## [Unreleased]

(Open for the next change set.)
