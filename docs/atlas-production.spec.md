# Atlas: production quality

**Status:** approved by the Director 2026-09-30, after the plain-English read-back. Companion to `docs/atlas-page.spec.md`, `docs/atlas-sidecar.spec.md` and `docs/atlas-test-gaps.spec.md`. It answers a triage of 2026-09-30 that used Atlas across the fleet and hit its edges: Atlas surfaced none of the failure causes it was asked about, though three sat in files it already parses, and it reported "no map" for repositories that had one upstream.

**Rulings it builds on (Director, 2026-09-30):**
1. A committed map is an org standard for every repository that runs workflows.
2. The new checks are notices for one release, then fail `atlas check` once the fleet shows them reliable.
3. The fleet runs one engine version, bumped by pull requests.
4. The container keeps its present role and gets no new work.
5. Repositories in languages Atlas does not parse get a map of their doors.
6. The org view is built in housekeeping, in its own session.

**The rules that do not move.** Offline: no network call, no model inside. Read-only outside `atlas map`. Every fact carries its basis. Every answer says where it came from and what Atlas cannot see.

## Research grounding

One research lane (Sonnet, 2026-09-30) read the two real failing cases and the primary sources. Each finding names what it changes here.

| Source | Finding | What it changes |
|---|---|---|
| npm, *package-lock.json* and *package.json* docs, CLI v11, https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json | A lock entry records `engines`, `os`, `cpu`, `bin`, `optional` and `optionalDependencies`. `libc` is defined but rarely written (165 of 128,897 entries in 395 lockfiles on this rig). | Both checks read the lock alone. musl or gnu comes from the binding's name, never from `libc`. |
| npm/cli issue 4828 and PR 8184, https://github.com/npm/cli/issues/4828, https://github.com/npm/cli/pull/8184 | A lock written on one platform drops the other platforms' optional native bindings. Fixed in npm 11.3.0, not in 10.x; the runner image ships npm 10.9.8. A lock committed broken stays broken. | D2 exists, and stays useful after the fix. |
| The same issue; nrwl/nx issue 34194, https://github.com/nrwl/nx/issues/34194 | The failure shows two ways: `npm ci` fails with "Missing … from lock file", or passes and the tool fails at run time with "Cannot find module". | D2 states the fact about the lock. It does not promise which step fails. |
| Measured on this rig, 2026-09-30 | Of 395 lockfiles, 389 list every binding their parents name; 6 do not, all written on Windows. One of the six holds 1 of 9 bindings for `satteri`, and the same shape for five more packages. | D2's detection rule and its guards. One finding per lockfile, naming the packages. |
| npm config docs, https://docs.npmjs.com/cli/v11/using-npm/config | `npm ci` only warns on an `engines` mismatch (`EBADENGINE`) unless `engine-strict` is set. | D1 never reads every package's `engines`. It reads the tool the step runs. |
| Astro `bin/astro.mjs`; Next.js `bin/next.ts` (their repositories, main branches) | Both check the Node version at start and exit 1. Vite prints a requirement; whether it exits is unconfirmed. Vitest 5 has no confirmed start check. | D1 has two strengths of sentence: "refuses to start" for a tool on the known list, "declares" for any other. |
| actions/setup-node README and advanced usage, https://github.com/actions/setup-node | `20` resolves to the newest 20.x at run time; `lts/*`, `latest` and `node` cannot be known offline; `node-version` wins over `node-version-file`. | D1 compares a range with a range, and stays silent on forms it cannot know. |
| GitHub-hosted runners reference, https://docs.github.com/en/actions/reference/runners/github-hosted-runners; changelog 2026-09-17 | `ubuntu-latest` is linux, x64, glibc. It moves from 24.04 (Node 22) to 26.04 (Node 24) between 2026-10-19 and 2026-11-19. | A job with no setup step has no known Node, so D1 says nothing about it. |
| Sadowski et al. 2018, "Lessons from building static analysis tools at Google", and Distefano et al. 2019, "Scaling static analyses at Facebook" (already cited in `docs/atlas-test-gaps.dispatch.md`) | Checks are kept under 10% effective false positives; findings shown at the moment of change are fixed, batch lists are not. | The precision bar, notice-first, and `atlas_check_change` as the first place a finding shows. |

Not confirmed from a primary source, and so out of the first version: how pnpm and yarn lockfiles record platform bindings. The first version reads `package-lock.json` only.

## Part 1: where an answer comes from

**Before 1.24.0.** The sidecar and the read commands answered only from `atlas/` in the working tree of the repository they were started in. A clone a few commits behind read as "no map", and the remedy it printed was a write. Items 1 to 5 were built in slice AH for release 1.24.0; "As built" lines say where the build settled a detail.

1. **A ref.** `explain`, `gaps` and every sidecar tool but `atlas_refresh` take a `ref` (CLI `--ref`). The map is then read from `git show <ref>:atlas/…`, and files are read at that ref. Git runs read commands only; nothing is fetched.
   - The map's commit must be in that ref's history.
   - The provenance line says which ref answered and how far it is from the checkout: "map 3fa91c2 from origin/main, 4 commits ahead of this checkout".
   - "Changed after the map" is then judged between the map's commit and the ref, not the working tree, and the answer says so.
   - As built: `atlas_check_change` takes a ref only when the checkout holds the commit that map was made from, since it compares the working tree with the map; otherwise it refuses and says why. A ref that names nothing is `ATLAS_REF_UNKNOWN`; a map whose commit is not in the ref's history is `ATLAS_REF_MAP_FOREIGN`.
2. **A newer map upstream.** When the checkout's map differs from the one on its fetched upstream, the provenance line says so and names the ref to pass. Atlas never switches by itself. As built: the line appears only when the upstream also holds commits the checkout lacks, so a checkout that is ahead with its own newer map is told nothing. The upstream is the branch's own (`@{u}`), else `origin/HEAD`.
3. **The no-map message.** In this order: a fetched ref that holds a map, with the argument to pass and how far behind the checkout is; then `atlas_refresh`, which writes only its cache; last, `atlas init`, `atlas map` and a commit. As built: `atlas_refresh` fails with no boundary file, so it is offered only when one exists; and `atlas init` is named only when there is none, since `init` refuses to overwrite one.
4. **A folder that is not a git repository.** `explain`, `gaps` and the sidecar's map-only tools answer for a directory that holds `atlas/structure.json`. The provenance line says "an exported tree: history and freshness not checked". `map` and `check` still need git, and say so with a code from the error table (`ATLAS_NOT_A_REPOSITORY`; before 1.24.0 it was a bare usage line).
5. **A workflow file explained.** `atlas explain <workflow>` prints its door: triggers, each job with its runtime (Part 2), each step's command, what it sends, what it reaches, and any finding on it. "Imports no file" is no longer said of a file Atlas does not parse for imports.
6. **Another repository, later slice.** Each sidecar tool takes `repo`, an absolute path. It is honoured only under a root the client offered or one listed at start; the real path is compared after links are resolved. Anything else is `ATLAS_SIDECAR_REPO_NOT_ALLOWED`. This diff gets one security review before it merges.

## Part 2: the runtime of a door

Atlas already reads `runs-on` and `working-directory` and discards them. Each job of a workflow door now records, basis `declared`:

- `runsOn`: the labels, per matrix leg where the matrix is literal; and the platform they mean (`os`, `cpu`, `libc`) when every label is a GitHub-hosted one. A `container:` image, a self-hosted label or an expression leaves the platform `unresolved`.
- `environment`: the name only.
- `setup`: for each `actions/setup-node` and `actions/setup-python` step, the version as written, the version file it names and what that file says, and the range it can resolve to offline (or `unresolved`).
- On each command: the directory it runs in.

`atlas check` does not compare doors, so an adopter on an older pin is not reddened by the new fields.

## Part 3: two checks on a door

A finding is a fact with its rule, its door, job and step, and the lines it was read from. It is recorded in the map at map time, and `atlas check` computes it again from the tree.

**D1, toolchain.** Fires when all hold:
- the step runs a tool whose package is in the lock of the step's directory (through `npm run` scripts, as doors are already read);
- the job pins a Node version before that step in a form known offline;
- the package's `engines.node` excludes every version the pin can resolve to.

Guards: a pin of `20` means any 20.x, so `^20.19.0 || >=22.12.0` does not fire. No setup step, `lts/*`, `latest`, an expression: no finding, and the runtime is listed under what Atlas cannot see. Only the tool the step runs is read, never the whole lock, unless a tracked `.npmrc` sets `engine-strict=true`.

Sentence, for a tool on the known list (Astro, Next.js): "Deploy site pins Node 20 and runs astro build; astro 7.3.3 requires Node >=22.12.0 and refuses to start." For any other tool: "… declares Node >=X", with no claim about failure. The same rule for Python (`setup-python` against the repository's own `requires-python`) is built second and ships only if the fleet check supports it.

**D2, lockfile platform.** Fires when all hold:
- a step runs `npm ci` in a directory with a tracked `package-lock.json`, in a job whose platform is known (`npm install` is not judged, and said so: the fleet check found it adds the missing binding at install time);
- a lock entry lists optional bindings, at least one listed binding is present with `os` and `cpu`, at least one is missing, and no present binding matches the job's platform.

Guards: a parent whose only listed binding is for another system (`fsevents`) does not fire, because no present sibling proves the pattern. `wasm32` bindings never count as a match or a miss. Only the parent's own listed children are judged. musl or gnu is read from the binding's name.

One finding per lockfile and job, naming the packages: "site/package-lock.json holds no linux-x64 binding for satteri, esbuild, sharp and 3 more (it holds win32-x64 only); Deploy site runs npm ci on ubuntu-latest." The remedy names its source: rewrite the lock with npm 11.3.0 or later, the release that carries the fix for npm/cli issue 4828.

## Part 4: where findings show

- `atlas_check_change`, when a workflow, a lockfile or a manifest is among the changed files: the findings on the doors involved, read from the tree. This is the moment before a push.
- `atlas check`: a **Notices** block after the verdict, in the error shape without an exit line. The exit code is unchanged. `--strict` makes a notice exit 1.
- `atlas explain <workflow>` and `atlas_overview`: from the map, as of its commit.
- **The engine notice.** `atlas check` also notes a map made by an older engine than the one running, or carrying no engine stamp: "the map was made by Atlas 1.14.0; this is 1.25.0; run atlas map". Whether a repository's pin is behind the fleet cannot be known offline; that belongs to the pin-bump wave and to housekeeping.
- Atlas posts nothing by itself: no comment, no issue.

**Becoming a gate.** Notices fail `atlas check` by default only after one release in which the fleet check shows each rule within the bar and the Director says so.

**As built (slice AI).** Beyond the label table above, `windows-*-arm` is win32 arm64 and `macos-13` and older, and `-large`, are darwin x64; a label outside the table, or more than one label, is unresolved. Version ranges are compared with `semver`, npm's own implementation, the one dependency this slice adds. A tool is matched only when the step reaches it through a package script, `npx` or `node_modules/.bin`; a bare `vite build` in a step is not matched. The Python form of D1 has its own rule id, `D1-python`. D2 names its packages in the lock's own order. A tracked `.npmrc` with `engine-strict=true` makes D1 read every package the lock installs. A finding on a step inlined from a reusable workflow names the file and no line. `atlas_check_change` treats a changed lockfile as a full-refresh reason.

## Part 5: the precision bar

As in the test-gap spec. Before a rule ships, it runs over every fleet repository at its default branch, and the coordinator reviews every firing. A rule wrong more than once in ten does not ship. A rule with fewer than 20 firings is judged on all of them and marked provisional. A finding is wrong when the repository contradicts a fact in it, or when the door it names is green for a reason the rule should have seen. The result is committed as `docs/atlas-door-checks.fleet-check.md`. **Met 2026-09-30:** D1 8 firings, none wrong, provisional; D2 one firing, wrong at the class (`npm install` repairs the lock), fixed and re-run, provisional; the engine notice right on 78 of 78.

Known before the run, and named in the slice brief: two doors where D1 should fire, one where D2 should, and the same-shaped green Pages doors that must stay quiet.

## Part 6: hardening

| Item | Today | Done when |
|---|---|---|
| Reach from every run | A door's reach is walked from its first 200 recorded runs; this repository's CI door has 740 | Reach is walked from all runs; the recorded list may still be cut, and says so |
| Test repositories and git maintenance | 94 test files create a temporary repository that git's background maintenance can race; two red legs on main so far | One shared helper turns maintenance off; a test reads the setting in a fresh repository |
| Cold `atlas_check_change` | About 10 s over 20 files, target 5 s | Measured under 5 s on this repository, the number reported |
| Tests skipped on a shallow clone | Two | They run on a fixture that does not depend on the clone's depth |
| The release's container job | Waits 5 minutes on an endpoint that lags | Polls the version endpoint for 15 minutes |
| A repository that leaves the public list | Its folder stays on the render branch and blocks later commits | The render removes it |
| Cut inner lists | Marked cut, no cursor | Carry a cursor |
| Files git does not track | `atlas map` leaves them out and says nothing, so a flow that writes files and maps before staging gets a map without them | The map stays of the tracked tree, and `map` names the untracked files outside `.gitignore` as a warning |
| A repository with no commit | `atlas map` exits 2 with "git rev-parse HEAD failed" | It says to commit once first |
| A program run through an action input | A step such as a retry action whose `with.command` runs `node` shows the map no program, so neither the map nor D1 sees it | The command inputs of known wrapper actions are read as the step's command; any other command-shaped input is listed unresolved |
| The written-down corners (1.22.0 to 1.23.4) | About twenty, unranked | A Sonnet lane counts how often each shows on the fleet's maps; the ones that produce a wrong sentence are fixed at the class, the rest stay stated limits |

## Part 7: one engine everywhere

Measured 2026-09-30: 79 repositories carry eight different pins; 11 are on 1.14.0, whose maps leave same-shaped Pages doors empty (fixed in 1.15.0); none is on the current engine.

- A tool, `scripts/atlas-pin-bump.mjs`, in the shape of the Codecov rollout tool: it checks a clone, plans the change as a diff (the pin, and the map made again by that engine), commits on a branch without pushing, and proves `check` green on a clean clone.
- The coordinator reviews each diff, pushes and opens one pull request per repository. Merges waited for the Director's word, which he gave for this wave on 2026-09-30: the coordinator merges a pull request once the tool's proof, its CI and the coordinator's review of the diff all pass, pinned to the reviewed head; any other pull request goes to him with the reason.
- A regression fixture holds the shapes of the Pages doors found on the fleet, so an empty door is red in this repository's own suite.
- A weekly job that opens these pull requests is a later decision; it needs a cross-org token.

## Out of scope

- The org view (door records joined to live Pages and environment settings, failed-run attribution, map-health findings): housekeeping, from its own hand-off. It needs the written org rule from ruling 1.
- Any network call from Atlas.
- `atlas map` on a folder that is not a git repository.
- pnpm and yarn lockfiles.

## Build order

1. **Slice AH:** Part 1 items 1 to 5. Built 2026-09-30.
2. **Slice AI:** Parts 2 to 5 and the Pages-door fixture. Built 2026-09-30; the fleet check was a script the coordinator ran, and the coordinator reviewed the firings. AH and AI ship together as release 1.24.0, since both were built before either was released and a release now carries a full treatment and a Docker proof; the later version numbers below move down by one.
3. **The pin-bump wave** at 1.24.0: the tool by one Opus agent, the wave by Sonnet agents.
4. **Slice AJ, release 1.26.0:** Part 6. The test and release items may run beside AI; the engine items follow it.
5. **Slice AK:** Part 1 item 6.
6. **Coverage and the docs pass:** door-only maps for the unmapped repositories that run workflows, first proving that Atlas maps a repository whose language it cannot parse; the landing page's Atlas section; the exit test.

Build slices are Opus agents, each in its own worktree, one commit per item, every test red first. Research, fleet checks and waves are Sonnet agents. Public sentences are the coordinator's.

## Acceptance (the oracle)

Every test is red on the tree before its slice.

1. **Ref.** A fixture clone three commits behind a remote whose branch holds a map: with no `ref`, the no-map message names the ref and the distance; with it, the answer comes from that map and its provenance line says so. The checkout is as it was.
2. **Exported tree.** A copy of a mapped repository without `.git` answers `explain` and `gaps`, with the exported-tree line; `map` and `check` exit 2 with the table's code.
3. **Workflow explain.** The door's triggers, runtime, commands and sends are printed; "Imports no file" is absent.
4. **Runtime.** Fixtures for a literal matrix, a version file, an expression and a container each record the right value or `unresolved`.
5. **D1.** A fixture in the shape of a fleet Pages door that pins Node 20 and runs astro 7 fires; the same door on Node 22 does not; `20` against `^20.19.0 || >=22.12.0` does not; `lts/*` does not.
6. **D2.** A fixture in the shape of a fleet lockfile written on Windows, with its door, fires once, naming six packages; a complete lock does not; a lock whose only missing child is `fsevents` does not.
7. **Notices.** `atlas check` exits 0 with a notice and 1 under `--strict`; an adopter's map made by an older engine passes with the engine notice.
8. **Determinism.** The map is byte-identical on a clean clone, after an install and on a CRLF checkout, findings included.
9. **Offline and read-only.** The static import check finds no network module; the checkout is as it was after every command.
10. **The fleet run,** Part 5, met before the checks ship (2026-09-30, `docs/atlas-door-checks.fleet-check.md`).
11. **The exit test.** The triage replayed on the clones it used: asked from a stale clone, Atlas names the upstream map; D1 and D2 flag the three doors whose cause is in committed files; no answer reports a missing map that exists.
12. **The existing gates:** `npm run verify` on a clean worktree, `atlas check`, the identity scan, then each release.

## Standards compliance

- **PIN_PER_STEP 2.** Every answer names the engine, the map's commit and now the ref; the fleet moves to one pinned engine.
- **ANDON_AUTHORITY 2.** A map that cannot be vouched for still halts the answer. The precision bar halts a rule before it ships.
- **NAMED_COMPENSATORS 2.** Table below.
- **DECOMPOSE_BY_SECRETS 2.** How a repository is built stays in Atlas; what GitHub says now stays in housekeeping. Findings are computed by the engine and shown by the adapters.
- **UNCERTAINTY_GATED_HUMANS 2.** The Director is asked at three points only: the spec read-back, each merge, and the change from notice to gate.
- **EXTERNAL_VERIFIER: conditional.** No verifier pass by default (Standing Rule 3). One targeted security review for the `repo` argument. If an outside-family check is wanted, the Director runs it by hand; nothing here calls Ollama Cloud.

| Irreversible action | Undo | State after | Owner |
|---|---|---|---|
| `npm publish` of a release | `npm deprecate` the version, then a patch release | The bad version stays installable but warns; the patch is `latest` | Coordinator, on the Director's word |
| Release tag and GitHub release | Delete the release and the tag | No release page; npm unaffected | Coordinator |
| Container image push | Delete the version in the package settings | `latest` points at the previous image after a re-push | Director (settings UI) |
| A merged pin-bump pull request | `git revert` of its merge commit in that repository | The old pin and the old map | Coordinator, per repository |
