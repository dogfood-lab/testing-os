# Dogfood Swarm Evidence — Stage A–D + Phase 9 (2026-04-27)

> **What this is**: Rich evidence catalog from the 24-wave dogfood swarm
> applied to testing-os itself between 2026-04-25 and 2026-04-27. Captured
> for future swarms consulting this repo: testing-os has been hammered
> hard, and the work documented here is the baseline. Don't redo what's
> done; use this as the starting point.
>
> Companion to the v1.1.2 commit message (which is the executive summary).
> This file is the long-form catalog suitable for repo-knowledge sync,
> Stage E carryover, and post-treatment audits.

## Run identifier

| Field | Value |
|-------|-------|
| Swarm run ID | `swarm-1777234130-30e3` |
| Save point | `swarm-save-1777234130` (revertable) |
| Commit | `b1ae259` (after pa11y fixes); originated at `0479436` (v1.1.2 first push) |
| Branch | `main` |
| Version delivered | `1.1.1 → 1.1.2` |
| Test count | `473 → 704` (+231, +49%) |
| CI state | GREEN (CI 19s + Pages deploy 54s with pa11y) |

## Stage outcomes

| Stage | Waves | Amends | Tests | Headline outcomes |
|-------|-------|--------|-------|-------------------|
| A (bug/security) | 1–6 | 22 | 508 | Initial pass; classifier + dispatch + fingerprint bugs surfaced (self-incrimination cluster); v1.0.0 follow-ups identified |
| B (proactive defensive) | 7–15 | 28 | 643 | 12 audit-coverage taxonomy classes documented; structured-error infrastructure (RecordValidationError, DuplicateRunIdError, IsolationError, CollectUpsertError); validate-record + atomic-write helpers extracted |
| C (humanization) | 16–20 | 21 | 688 | 5 cross-pollination chains validated; 2 reference pages added (state-machines.md, error-codes.md); wave-17 verdict-first banner format established; check-doc-drift.mjs config-driven introduced |
| D (visual polish) | 21–24 | 11 | 704 | pa11y CI gate live; severity tiers visually distinct; mobile nav; accent reconciled to logo (#34d399); architecture SVG + CLI screenshot; 3 ASCII state diagrams; TTY-aware findings renderer |

## Audit-coverage taxonomy (14 classes)

> A "class" = a category of audit gap that recurs across waves and benefits
> from sweep automation. Each class has a first-instance + verifying
> instance(s) + sweep-automation status.

| # | Class | First instance | Verifying instances | Sweep automation |
|---|-------|----------------|---------------------|------------------|
| 1 | Severity arithmetic in digest | wave 8 (findings-digest) | wave 9 file-glob pattern | inline test |
| 2 | Fingerprint description-hash drift | wave 8 | waves 9–24 (used by all collects) | unit test |
| 3 | Classifier marking deferrals as fixed | wave 7 (broken) → wave 8 (introduced `unverified` status) | waves 22–24 (status holds) | unit test |
| 4 | Dispatch domain-filter dumping all findings | wave 2.5 (findingsForDomain helper extracted) | every subsequent dispatch | unit test |
| 5 | Worktree absolute path normalization | wave 12 | F-693631-009 carryover | (none — Phase 5 candidate) |
| 6 | Atomic-write temp+rename | wave 12 (helper extracted) | findings/lib/atomic-write callers | unit test |
| 7 | NDJSON / human dual-emit | wave 9 (logStage) → wave 17 (verdict-first banner) | wave 22 + 24 sweep | sweep invariant test |
| 8 | Structured error envelope | wave 12 (typed errors) → wave 17 (error-render.js) | All commands using throw → exit | inline tests |
| 9 | **Sibling-pattern propagation gap** | wave 22 D-PIPE-001 (logStage) | wave 23 D-CI-001 (untagged-fence) + wave 24 LOW (path-traversal) | **wave-22 sweep invariant; needs check-shared-helper-adoption.mjs (Phase 5 #1)** |
| 10 | Stage collision in spread-last-wins | wave 22 D-PIPE-002 (run.js:209) | wave 22 wrapper-strip belt-and-braces | regression test |
| 11 | Data-shape drift between agents and schema | wave 8 (severity case) → wave 22 (normalize) → wave 24 (pipeline.summary type) | every collect | (none — Phase 5 candidate #6) |
| 12 | Under-triaged observability/silent-failure (wave-1 calibration) | wave 8 promotion pattern | waves 9–14 (Mike's MED→HIGH upgrades) | (briefing-only — no automation) |
| 13 | Cross-repo Class drift (consumed package contract) | Stage C site-theme (BaseLayout skip-link + favicon) | **Now multi-instance**: Phase 10 surfaced `@mcptoolshop/repo-knowledge@1.0.5` missing `schema.sql` in published artifact (broke `rk init` for every consumer). Pattern: swarms find upstream bugs in shared tooling. | Phase 5 #5 candidate |
| 14 | **Claimed-fixed without verification** | wave-24 F-916867-002 + F-916867-003 (wave-1 fixes that didn't actually land) | (NEW from Stage D) | Phase 5 #1 first deliverable: re-audit all wave-1 [fixed] findings against current code |

## Positive design patterns (7)

> Patterns the swarm DEVELOPED in flight, suitable for adoption by future
> swarms or Stage E productization.

| # | Pattern | Canonical example | Reference code |
|---|---------|-------------------|----------------|
| 1 | Verdict-first banner format | wave 17 logStage `[component:stage] VERDICT field=val` | `packages/dogfood-swarm/lib/log-stage.js` |
| 2 | doesNotMatch sanity check | wave 18 disambiguation in `renderWithStatus` 3-way exit codes | `packages/dogfood-swarm/lib/findings-digest.js` |
| 3 | Reference page as canonical glossary | wave 18 `state-machines.md` + `error-codes.md` | `site/src/content/docs/handbook/{state-machines,error-codes}.md` |
| 4 | Choke-point fix makes bug-class impossible | wave 22 wrapper-strip (`run.js:51-59` defensively strips inner `stage:` before delegating) + wave 23 findings-render single source | `packages/ingest/run.js`, `packages/dogfood-swarm/lib/findings-render.js` |
| 5 | State-machine-aware drift handler | wave 23 `untagged-fence` check kind in `check-doc-drift.mjs` (opener/closer aware, not regex) | `scripts/check-doc-drift.mjs` |
| 6 | Cross-wave-dependency formalized skip reason | wave 22 ci-tooling deferred contrast test → wave 23 docs delivered it | wave-22 ci-tooling.json + wave-23 docs.json + `scripts/check-severity-contrast.test.mjs` |
| 7 | **Graceful degradation / fallback execution** | Phase 10 — `rk init` failed (broken npm package) → wrote rich evidence catalog as structured markdown in same repo. Same data, more primitive durable form. | `docs/swarm-evidence-2026-04-27.md` (this file) |

> Pattern #7 generalizes: when a tool dependency breaks, capture the same
> data in a more primitive durable form. The primitive form is the
> contract; the tool is the convenience. Same family as wave-22
> wrapper-strip (defensive choke-point) but applied at the workflow
> layer rather than the code layer.

## Cross-pollination chains (5, with corrected claim shape)

> The Stage D methodology correction: chain validation requires audit
> against new + pre-existing callers + sweep automation in place.
> Status here uses the corrected shape.

| # | Chain | Original wave | Validation status |
|---|-------|---------------|-------------------|
| 1 | `validatePayload` extraction | waves 8 → 9 → 12 | Validated against new callers + pre-existing callers audited at wave 12 + sweep automation: regression test |
| 2 | `logStage` extraction (`lib/log-stage.js`) | wave 9 → wave 17 → wave 22 | **Validated three ways**: wave-22 sweep, wave-24 re-sweep, Phase 9 stress test (DOGFOOD_LOG_HUMAN=1 ingest path). Sweep invariant test catches future regressions. |
| 3 | atomic-write helper | wave 9 → wave 12 | Validated against new callers + pre-existing callers audited at wave 12 |
| 4 | Typed-error infrastructure | wave 12 → wave 17 | Validated against new callers; pre-existing audit pending Phase 5 |
| 5 | Reference-page-as-canonical-glossary | wave 18+ | Validated as documentation pattern; Stage E candidate to extend to handbook authoring guidelines |

## Methodology corrections (8 from Stage D closure receipt)

1. **Cross-pollination claim shape**: validate against new + pre-existing callers + sweep automation in place + invariant test
2. **Within-stage vs across-stage convergence**: distinct properties; cross-stage convergence is illusory when a new lens hits a never-audited surface
3. **Class #9 sweep-automation requirement**: insight → evidence-backed conclusion (D-PIPE-001 + untagged-fence + path-traversal helper)
4. **Wrapper-strip / choke-point pattern**: fix at the choke-point so the bug-class is impossible to recur
5. **`cross-wave-dependency`**: first-class skip reason (operationalized wave-22 → wave-23)
6. **Logo-verification-first**: read the file, not the comment (caught a verifiable lie in starlight-custom.css)
7. **State-machine-aware drift handler**: positive design pattern (opener/closer aware drift checks)
8. **`edit_path` field distinct from `file_path`**: confirmed Phase 5 deliverable (twice-validated by routing misses)

## Phase 5 candidates (10 total, 2 CONFIRMED)

| # | Candidate | Status | Evidence base |
|---|-----------|--------|---------------|
| 1 | `check-shared-helper-adoption.mjs` / `check-drift.mjs` generalization | **CONFIRMED** | D-PIPE-001 (wave 22) + wave-23 untagged-fence handler caught 2 wave-22 misses + wave-24 LOW: path-traversal helper missing in 1 of 3 callsites |
| 7 | `edit_path` field distinct from `file_path` | **CONFIRMED** | Wave 22 D-OUT-003 (file:site/styles → reroute to .github/workflows/pages.yml) + Wave 23 docs→scripts cross-wave handoff routing miss |
| 2 | `swarm tail` real-time human banner surface | candidate | wave-9 NDJSON + wave-17 banner imply it; folds in F-916867-004 verdict-first carryover |
| 3 | Provenance-on-display for resolve-vs-stored values | candidate | feedback memory standing |
| 4 | Visual regression CI gate productization (beyond pa11y) | candidate | Stage D wave 22 partially delivered; generalize beyond one page; Mermaid stateDiagram via build-time SVG export folds in here |
| 5 | Cross-repo drift-checker (Class #13 propagation) | candidate | Stage C site-theme upstream PR pending |
| 6 | Collect-time normalize step for agent-format-drift | candidate | Wave 22 + 24 — recurring pipeline.json normalize + fingerprint collision disambiguation |
| 8 | Cross-wave-dependency formal skip reason in briefing template | candidate | Wave 22 ci-tooling agent's correct deferral instinct |
| 9 | Vitest config narrowing | candidate | Phase 9 surfaced — vitest walks workspace and tries to load node:test format files; should narrow to `packages/schemas/test/**/*.test.ts` only |
| 10 | Contrast unit test sweep across all text-using-accent surfaces | candidate | Pa11y caught 6 light-mode link/nav contrast violations the wave-23 unit test missed (test surface ≠ visual surface) |

## Self-incrimination tally (6+)

Swarm tooling bugs caught + fixed by the swarm running on it (testing-os auditing testing-os):

1. `findings-digest.js` — severity arithmetic bug + file-glob pattern (`*.output.json` → `<domain>.json`) — waves 8–9
2. `lib/fingerprint.js` — description-hash drift + ID-as-symbol disambiguation — wave 8
3. Classifier — marked deferrals as `fixed` without positive evidence; introduced `unverified` status — wave 7 → wave 8
4. `commands/dispatch.js` — `--isolate` silent fallback to non-isolated mode — wave 12
5. `commands/dispatch.js` — domain-filter dumping all findings to all agents — wave 2.5
6. `lib/log-stage.js` — cross-pollination chain #2 incompleteness (private logStage in ingest bypassed shared helper) — wave 22

## Wave-1 deferred follow-ups (5, still tracked)

From the testing-os v1.0.0 ship (2026-04-25). Not Stage A-D scope; surface here for repo-knowledge continuity:

1. `DOGFOOD_TOKEN` secret missing on consumers
2. `ai-loadout` build broken
3. Action SHAs Node-20 deprecated
4. `site/` npm audit
5. Dep scanning gap

## Override discipline (1 instance)

**Wave 23 docs ownership violation override**: docs agent edited 6 files in `scripts/**` (ci-tooling domain) per under-specified coordinator briefing on cross-wave handoff. Override logged in `agent_state_events` for `agent_run=199` with full rationale. Routing model deficit promoted to confirmed Phase 5 #7 deliverable. Wave-24 re-audit confirmed the work belongs in `scripts/` stylistically (indistinguishable from native ci-tooling work — verified by independent ci-tooling re-audit agent).

Discipline preserved: work was substantively correct, briefing was under-specified, model gap documented for Phase 5.

## Coordinator cleanups (3 instances)

Mechanical, no design judgment, same authority class across all three:

1. **Wave 22 collect-time normalize** for `pipeline.json` (lowercase severities → uppercase, summary/detail field names → description, fingerprint disambiguation via ID-as-symbol)
2. **Wave 23 `package.json` test:scripts wire-up** — added 3 new docs-written test files (check-severity-contrast, check-accent-color, check-handbook-imagery); 28 → 52 tests in `test:scripts`
3. **Phase 9 F-916867-001 fix** (state-machines.md "default 14 days" → "default 30 days" matching `DEFAULT_MAX_AGE` in `portfolio/generate.js:32`)

## Stage D wave-by-wave summary

| Wave | Phase | Findings | Outcome |
|------|-------|----------|---------|
| 21 | stage-d-audit | 6 HIGH / 16 MED / 20 LOW (42 total) | Audit baseline; D-PIPE-001 headline finding (cross-pollination chain incompleteness) |
| 22 | stage-d-amend | 3 fixes (D-PIPE-001/002, D-OUT-003) | Foundation slice. Wrapper-strip + sweep invariant test. Cross-wave handoff initiated. |
| 23 | stage-d-amend | 8 fixes (D-DOCS-001/002/003/008, D-CI-001/002, D-DOCS-007, D-BACK-002) | Polish cluster. Logo lie caught + reconciled. Cross-wave handoff delivered. Override applied. |
| 24 | stage-d-audit | 0 CRIT / 0 HIGH / 2 MED / 3 LOW | Re-audit clean. Stage D closed. |

## Wave 24 deferred → post-treatment / Phase 5 dispositions

| Finding | Disposition |
|---------|-------------|
| F-916867-001 (state-machines.md "14 days" → "30 days") | Coordinator cleanup applied at Phase 9 |
| F-916867-002 (wave-1 schema descriptions incomplete) | **Phase 5 #1 first deliverable** — re-audit wave-1 [fixed] findings (Class #14) |
| F-916867-003 (schemas package.json files: missing) | Same as F-916867-002 — folds into wave-1 [fixed] re-audit |
| F-916867-004 (portfolio CLI verdict-first) | Folds into Phase 5 #2 (`swarm tail`) |
| F-916867-005 (path-traversal helper missing in 1 of 3 callsites) | **Phase 5 #1 canonical instance** |
| GHA UI screenshot from D-DOCS-008 | Mike-driven asset add post-treatment |
| Mermaid stateDiagram-v2 | Phase 5 #4 (build-time SVG export, not runtime browser) |

## Phase 9 specific findings

| Investigation | Outcome |
|---------------|---------|
| Vitest 6 file-load failures | Pre-existing config issue (vitest walks workspace + tries to load node:test format files). NOT Stage A-D regression. Phase 5 #9. |
| Override cleanup verification | `npm run test:scripts` produces 52/52. Wired correctly. |
| Cross-pollination chain #2 stress test | Verified via DOGFOOD_LOG_HUMAN=1 direct logStage call. NDJSON + verdict-first banner both emit. Outer stage='error' preserves with failed_stage='foo' separately. Wave-17 contract satisfied through ingest path. |
| Save-point reachability | Both `swarm-save-1777234092` and `swarm-save-1777234130` reachable. 0 commits between save and HEAD before commit cadence (now 3 commits since: 0479436, cae59cb, b1ae259). |
| Numerical correction | Wave-24 ci-tooling agent's "742 tests" was double-counting (vitest 38-pass = schemas package, already in workspace count). Actual unique: 704. |

## Post-Phase-9 commit cadence (3 commits)

| Commit | What |
|--------|------|
| `0479436` | chore(swarm): Stage A-D dogfood swarm + Phase 9 — v1.1.2 (111 files, +11698/-484) |
| `cae59cb` | fix(ci): pa11y --no-sandbox shim for GHA puppeteer |
| `b1ae259` | fix(site): light-mode accent ramp — pa11y WCAG AA on white |

The pa11y CI gate caught a real Stage D regression on first deploy (light-mode contrast at 1.92:1) that the wave-23 unit test missed because its surface was narrower than the visual surface affected. **Test surface ≠ visual surface** is a sibling to the wave-22/23 routing-miss class. Phase 5 candidate #10 added.

## Brand identity verification

| Asset | Hash | Bytes | mtime | Status |
|-------|------|-------|-------|--------|
| `site/public/logo.png` | `30093bd6...` | 950504 | 2026-04-25 (pre-Stage-D) | byte-untouched, sacrosanct |
| `assets/logo.png` | `30093bd6...` (same) | 950504 | 2026-04-25 | byte-untouched, sacrosanct |

Wave-23 logo verification (read the file, not the comment) determined the logo IS green (`#34d399` emerald-400). The starlight-custom.css comment claiming "matches blue cube logo" was provably wrong. Reconciled handbook accent → green. Light-mode accent darkened to `#008857` (Phase 9 follow-up) for WCAG AA without disturbing brand canon.

## Repo state at Phase 10

- `npm run verify`: 704/704 pass, 0 fail
- `shipcheck audit`: 100% on hard gates A-D (20 checked / 17 skipped-with-justification / 0 unchecked)
- Landing page: HTTP 200 (`https://dogfood-lab.github.io/testing-os/`)
- Reference pages: HTTP 200 each (`/handbook/error-codes/`, `/handbook/state-machines/`)
- Repo metadata: description set, homepage set, 6 topics
- Mike-supplied logo: byte-untouched
- Cross-pollination chain #2: verified complete (sweep + re-sweep + stress test)

## What's NOT in this catalog

- Per-wave agent JSON outputs (gitignored under `swarms/swarm-*/`)
- SQLite control plane (gitignored as `swarms/control-plane.db`)
- Translations (Mike runs polyglot-mcp locally per discipline)
- Internal SDLC artifacts not relevant to a future swarm consulting this evidence

## For future swarms

If you are a swarm operator landing on testing-os post-2026-04-27:

1. **Read this file before dispatching Stage A.** Most of the easy wins are already taken.
2. **Read `swarms/PROTOCOL.md`** — it has been refined through Stage A-D.
3. **Class #14 (claimed-fixed without verification)** means: don't trust prior `[fixed]` markers without re-validating. Wave-1 fixes were self-reported, sometimes inaccurately.
4. **The 2 confirmed Phase 5 deliverables** (`check-shared-helper-adoption.mjs` + `edit_path` field) would dramatically reduce future swarm overhead. If you have time, productize them first.
5. **Cross-pollination chain #2 (logStage)** is the canonical example of a chain done RIGHT (sweep + invariant test). Use it as the reference pattern.
6. **Mike-supplied assets are sacrosanct.** The logo is `#34d399` emerald. Don't propose a redesign.
