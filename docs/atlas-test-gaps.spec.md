# Atlas: test gaps and harness suggestions

**Status:** approved by the Director 2026-09-26. Companion to `docs/atlas-sidecar.spec.md`. The research grounding is `docs/atlas-test-gaps.dispatch.md`; its load-bearing findings were confirmed by four model families, and findings are cited by author and year. It builds after release 1.23.0 and the Codecov pilot.

**The rule.** Asked, never pushed.
- **Query-driven.** A person or an agent asks Atlas what no test reaches and what should test it.
- **Facts, then suggestions, kept apart.** Atlas answers with facts, then suggestions. Each suggestion names its rule, the facts that triggered it, and the source of what it suggests.
- **Nothing on its own.** Atlas posts no pull-request comments, issues or nudges, and any automation needs the Director's approval first (Director, 2026-09-26; Wessel et al. 2021: pull-request bot comments read as noise).
- **Atlas points; the agent writes.** Atlas never writes or scaffolds a test (Yoshimoto et al. 2026: agents' tests add coverage comparable to people's).
- **Offline.** Atlas makes no network call for this feature.

## Where it answers

- `atlas gaps [path]` on the command line, and the sidecar tool `atlas_test_gaps` (a repository, part, directory or file).
- `atlas_check_change` in the sidecar spec carries the same facts for the files a change touched. That is the moment an agent is at work, and where feedback changes what it does (Chen et al. 2024; Kjellberg et al. 2026; Distefano et al. 2019: the same findings were fixed about 70% of the time at review and about 0% as batch lists).

## Reach, defined

A test **reaches** a file when:
- a test file imports it, directly or through the import graph;
- a test runs it as a process: a spawn or exec of the file, or of an installed command whose entry is the file; or
- a runner's own discovery collects tests inside its part.

Every reach fact carries its basis (the sidecar spec's `basis`) and says which of the three it is. Reach is not proof of exercise: a test that mocks a module still imports it (Hora & Robbes 2026: agents add mocks more often). So facts say **"no test imports or runs this"**, never "untested". The word *untested* is reserved for measured coverage (G7). Reach is stated at the file and part level, where test-to-code linking is reliable; finer claims are qualified (White et al. 2020: 93% precision for class-level links, 78% at function level).

## Three layers

1. **What is there.** These are facts. For each part:
   - the test runners CI executes for it, **attributed through package scripts** (see Build order);
   - its test files, and which of them CI runs;
   - test files a job's shell glob leaves out;
   - whether coverage is collected, and whether JUnit results are written, from the runner's configuration;
   - whether a Codecov upload step exists.

   A runner Atlas cannot attribute is reported as **not attributed**, never as absent.
2. **What is missing.** Also facts:
   - parts no test imports or runs;
   - test files no CI door runs;
   - installed commands no test runs;
   - a repository with no test runner at all;
   - error-handling constructs (`catch`, `except`, `throw`/`raise`, `Result` errors) in files no test imports or runs.

   Error handling is the least-covered code (Lima et al. 2021). Failure paths inside partly tested files need measured coverage, which is G7.
3. **What to add.** Suggestions, not facts:
   - **What each carries:** a rule id, the triggering facts, the suggested runner or command, and its source.
   - **Source order (Director, 2026-09-26):** the house standard, where one exists, naming its file; otherwise fleet practice, naming "N of M repositories of this kind"; otherwise external practice, naming the framework's documentation.
   - **Behaviour, not files:** a suggestion names the behaviour a test should exercise, not only a file to add.

## Kind of code

Each part gets exactly one kind, decided by its language and manifests. The most specific kind wins: an MCP server over a Node library, a Tauri app over a TypeScript monorepo. The answer names the kind it used, so a disputed suggestion can be traced to the kind decision.

## Ranking and size

**Code gaps** are the parts and files no test imports or runs, and uncovered failure paths. They are ranked in a fixed order:
1. on the path of a door that ships or runs in CI, before those that are not;
2. higher fan-in first;
3. more changes in the history window first;
4. more error-handling constructs first;
5. the path, as a deterministic tie-break.

An answer lists the five highest, with a count of the rest (Lin et al. 2026: denser structure shows diminishing returns for agents; Haas et al. 2025: even a lightweight risk ranking helped practitioners find high-risk gaps). **Hygiene items** (tests CI does not run, coverage not collected) are listed apart from code gaps, never ranked among them. Every answer leads with what reaches, or would reach, the gap.

## The rules

| Id | Fires when | Suggests |
|---|---|---|
| G1 no-runner | A code part of some kind has no test importing or running it, and no runner in the repository covers that kind | The source-ordered runner for that kind |
| G2 tests-not-run | Test files exist that no CI door runs, including those a glob leaves out | The CI invocation, using the runner's own discovery |
| G3 command-untested | An installed command (a `bin`, a console script, a cargo binary) that no test runs | An end-to-end test that runs the command |
| G4 no-coverage | Tests run in CI but no coverage is collected | The studio's coverage recipe (Full Treatment Phase 4; see Codecov) |
| G6 failure-paths | Error-handling constructs in files no test imports or runs | Tests that exercise those failure paths, naming the constructs |

**Later: G7 changed-untested.**
- **Input.** It waits for a local coverage report (`coverage/lcov.info` or a Cobertura XML).
- **What it says.** The lines a change touched that the last local test run did not execute, as a `measured` fact dated by the report. This is test gap analysis (Eder et al. 2013: 43% and 40% of changed methods went untested in two releases, and they carried more bugs).
- **Guard.** G7 answers only when the report matches the working tree: its commit is HEAD and the covered files are unchanged since. Otherwise it says the report is stale.

**Removed after review: G5 (silent Codecov upload).** A missing report on Codecov has several causes: a failed upload, a private project, a wrong slug, a branch not yet run. So a single prescribed fix would be a guess, and the rule needed the network. Upload health belongs to the Codecov rollout, which confirms delivery through Codecov's API for every repository it touches.

## The source table

The source order is the Director's (2026-09-26). "Fleet" counts the 79 repositories on the published fleet page (the coordinator's fleet survey of 2026-09-26). Runners were ground-truthed against manifests and CI, not taken from the map alone.

| Kind of code | House standard | Fleet practice | External practice | Default suggestion |
|---|---|---|---|---|
| Node/TypeScript library or CLI (25) | None studio-wide. testing-os's own rule (JS packages on `node --test`, TS on Vitest, in its `CLAUDE.md`) is repository-specific and is cited only for testing-os | Vitest 14, `node --test` 7; coverage via Vitest v8 7, c8 3 | — | Vitest for TypeScript, `node --test` for plain-JS packages |
| MCP server (14) | None | Vitest 12, pytest 2 | The MCP SDKs take no position | Vitest (Node), pytest (Python) |
| Python library or CLI (18) | None studio-wide | pytest 17; coverage via pytest-cov 9, coverage.py 5 | — | pytest with pytest-cov |
| TypeScript monorepo (9) | None | Vitest 6, `node --test` 3 | — | Vitest at the root; Playwright end to end where there is a UI |
| Tauri desktop app (5) | Desktop apps verify with `cargo check`, `tsc --noEmit`, `vitest run` (`E:/AI/.claude/CLAUDE.md`) | Vitest 4, cargo test 3; no coverage tool on any of the 5 | Tauri's testing guide: mock-runtime Rust tests, WebDriver end to end | Vitest (front end) and cargo test (Rust) |
| Rust crate or CLI (2) | None | cargo test 2 | cargo test is the ecosystem default | cargo test |
| VS Code extension (2) | None | Split | Microsoft: `@vscode/test-cli` and `@vscode/test-electron` | Vitest for units, `@vscode/test-cli` for the extension host |
| Godot game (1) | None | The repository's own headless runner, chosen deliberately | GUT or gdUnit4 (no official pick) | Keep the repository's runner; gdUnit4 is the reference for a new Godot project |
| Data or asset pack (1) | None | pytest as a manifest and schema validator | — | pytest as a validator |

**Static sites** are handbooks in 78 of 79 repositories, and only one is a site repository in its own right. They run build, schema and link checks, and they get no runner suggestion today.

**Coverage.** Full Treatment Phase 4 is the house standard: a coverage dependency, a coverage CI step, a Codecov upload and a README badge. Coverage thresholds are ratchets to the current figure, not fixed targets (a Director ruling). The fleet does not yet meet it:
- 46 of 79 repositories collect no coverage;
- 16 have a Codecov step, and of the 13 whose delivery was checked, one delivers.

G4 cites this standard. The Codecov rollout is how the fleet meets it.

**Other house rules cited.**
- "Tests Ship With Code": every commit (`hard-rules.md`).
- The shipcheck hard gate D1 requires a verify script covering test, build and smoke. Atlas does not re-audit what shipcheck gates; it cites D1 where a suggestion touches it.

## Precision bar

A **fact is wrong** when the repository contradicts it: a runner that is in fact present or attributable, a test that does import or run the file, a glob that does collect the file.

A **suggestion is wrong** when:
- it is already in place;
- its source is misattributed;
- it would not change the gap it names; or
- it rests on a wrong fact.

Before a rule ships, it runs over every fleet map:
- **Suggestions:** the coordinator reviews every one the rule makes.
- **Facts:** a sample of at least 20 facts of each kind is reviewed.
- **Error rates:** reported per rule and per kind of code.
- **The bar:** a rule wrong more than once in ten, overall or for any kind of code with at least five firings, does not ship. A rule with fewer than 20 firings on the fleet is judged on all of them and marked provisional. Google holds its checks to under 10% effective false positives (Sadowski 2020).

## Never evidence

Commit messages, pull-request text and anyone's claim that something is tested never count. Only the map and measured coverage count. Evidence over self-report is the founding rule of testing-os.

## Build order

1. **Runner attribution first.** Attribution follows package scripts (npm, pnpm and yarn, through nested scripts), shell scripts, Makefiles and local reusable workflows, with one fixture per shape. `roll`'s shape, Vitest inside `npm run verify`, is attributed to Vitest. G1 stays off until attribution passes the fleet check, because otherwise it would tell repositories with tests that they have none.
2. Reach as defined above, with its basis on every fact.
3. The rules G2, G3, G4 and G6, then G1.
4. `atlas gaps` and `atlas_test_gaps`, then the facts inside `atlas_check_change`.
5. G7 when local coverage reports are in use.

## Acceptance (the oracle)

Every test is red on the tree before the slice.

1. **Runner attribution:** a fixture per shape (nested npm, pnpm and yarn scripts, a shell script, a Makefile, a local reusable workflow). An unattributable runner reads "not attributed".
2. **Reach:** fixtures where a test imports, spawns, or discovers the file each yield reach with the right basis. A mocked import still counts as reach and is marked "imports".
3. **Per rule:** a fixture where it fires and one where it stays silent.
4. **Kind:** a TypeScript MCP server inside a monorepo resolves to "MCP server", and the answer names it.
5. **Source order:** a house standard beats fleet practice; a kind with no house standard states the fleet counts; a kind the fleet lacks names external documentation.
6. **Ranking:** a fixture with known risk facts yields the pinned order, and hygiene items are listed apart.
7. **Size:** at most five ranked code gaps and a count of the rest.
8. **Offline:** the modules behind this feature import no network module (the static check from the sidecar spec, applied to the CLI as well).
9. **Read-only:** the checkout is as it was after every command.
10. **The fleet run:** every rule over all fleet maps, with its firing count, and the coordinator's error rate per rule and per kind. The precision bar is met before shipping.

## Cross-family review (2026-09-26)

The draft went to six families. OpenRouter's Gemini seat failed with a payment error, and OpenRouter was retired the same day on cost. Five reported: Grok 4.7 (xAI) through OpenRouter, and kimi-k3, glm-5.3, deepseek-v4-pro and minimax-m3 on Ollama Cloud.

**Taken:**
- G5 removed (Grok, kimi, glm, the first two with a causal-leap argument).
- Reach defined, and "untested" reserved for measured coverage (Grok, kimi, glm).
- Runner attribution specified and made first, with "not attributed" in place of absent (kimi, deepseek, minimax).
- The precision bar defined, applied to facts, reported per kind and with sample sizes (kimi, deepseek, glm).
- A pinned ranking, with hygiene items split from code gaps (Grok, glm).
- One kind-resolution rule (Grok).
- testing-os's rule identified as repository-specific (minimax).
- The static-site row reduced to a note (minimax).
- G7's provenance guard (deepseek).

**Not taken, with reasons:**
- **G6 at line level (deepseek).** A static map cannot see partial coverage. The limit is stated, and G7 carries measured failure-path gaps later.
- **A network check for the CLI (minimax).** Moot once G5 is removed; the whole feature is offline.
