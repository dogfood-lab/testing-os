# Atlas and testing-os: the build-up before the next pin wave

**Status:** slice AM approved by R&D on 2026-10-13, with four additions to AM-6, folded in below, and merged as #159. Slices AN to AQ, multi-repository Atlas, approved by R&D the same day; their section is below. The Director set the direction: build up Atlas and testing-os before the fleet moves off Atlas 1.24.0, with R&D shaping the work. The Research and Development session rules scope and reviews each pull request with "[R&D]" verdicts. The Publisher holds the 5090 card grants and decides merges in interlock and rnd. The testing-os session builds.

**Order (the Director's ruling of 2026-10-13, through R&D):** Atlas is built up before any testing.
- Slice AM, then testing-os#158, then multi-repository Atlas (slices AN to AQ, below).
- All three ship in one release, with one pin amendment in rnd.
- After that release come the atlas-mcp-utility probes, the pilot, rung 1 and the repository ladder.
- The exit test and the landing page stay later items, below. The `test_fake_hides_platform` check runs alongside.

This replaces the order R&D set earlier the same day, which put the instruments and the experiment straight after AM.

**Rig load.** While a measurement holds a GPU grant, only targeted single-package test runs. These wait for The Publisher's "grant end":
- the full `npm run verify`;
- clones or maps beyond one small repository;
- Docker and WSL.

**The fleet pin stays at 1.24.0 until the build-up ends.** A pin wave then needs The Publisher's window. Its interlock PR merges on The Publisher's word, and its rnd PR on R&D's, which requires the changelog lines that change check results and a check run on rnd at the new pin.

## Slice AM: a new file in a folder with no part

### What happens now

`atlas check` fails with `ATLAS_UNASSIGNED_NEW` when a tracked file belongs to no part and the committed map did not list it as unassigned. A folder no boundary glob reaches therefore fails CI on every new file in it. Regenerating the map pardons that one file, and the next file fails again.

- interlock's `receipts/` failed main twice: `e3-ref-2026-10-11b.jsonl` on 10-11 and `e5-2026-10-13b.jsonl` on 10-13.
- At least five repositories hit the code between 2026-09-30 and 2026-10-13, counted from session transcripts.
- rnd's `datapacks/` had the same gap, closed by rnd #3.
- A proof on a clone of interlock at a186386, engine 1.24.0:
  - today's boundaries with the map regenerated: check exits 0, then a staged new receipt exits 1;
  - with a `receipts/**` part: a first and a second new receipt both exit 0.

The 10-13 failure had a second cause. The map was made before the receipt was staged, so the map never saw it. 1.25.0 already prints `ATLAS_MAP_UNTRACKED` from `map` in that case, but no fleet repository has that release yet.

### Rulings (R&D, 2026-10-13)

- (a) `check` prints the exact boundary lines to add: **yes**.
- (b) `map` warns about a top-level folder with no part: **yes**.
- (c) A new file in a folder that is already wholly unassigned stops counting as drift: **no**. It would let a whole new directory of code in unmapped, which is what the check exists to stop. (a) and (b) make it unnecessary.
- (d) The check says when the map is older than the staged files, or its hint says to map after staging: **yes**.

### Items

**AM-1, the lines to add (a).** When `check` fails with `ATLAS_UNASSIGNED_NEW`, the finding is followed by the boundary lines that would assign each offending file, indented and ready to paste into `atlas/boundaries.yaml`.
- **Grouping:** offending files are grouped by top-level folder. A file at the top level is grouped as the repository root, with glob `*`.
- **A folder no glob reaches** gets a new part: its name is the folder's name, its glob is `<folder>/**`, and its role comes from `roleFor` on its files, the function `init` already uses.
- **A folder a part already reaches in part** (a part's globs cover some of its files) gets no new part. The lines name that part and the glob to add to it: the narrowest folder that holds the offending files, as `<dir>/**`.
- **A name already taken** by a part elsewhere: the lines name that part and the glob to add, never a duplicate name.
- **The "what to do" line** becomes: "add the lines below to atlas/boundaries.yaml, stage the new files, run atlas map, and commit atlas/".
- **Output stays parseable:** the finding's existing lines keep their shape and order, and the suggestion follows them. Housekeeping reads `structure.json` and the pin, not `check`'s text (checked 2026-10-13 in `scripts/export-public.mjs`). It is told before the merge all the same.

**AM-2, the folder notice (b).** `atlas map` prints a notice, `ATLAS_MAP_UNASSIGNED_FOLDER`, on stderr when a top-level folder, or the repository root, holds tracked files no part owns.
- It names each folder with its count of unassigned files and gives the same lines as AM-1.
- `atlas/` is never counted.
- The exit code is unchanged, as with `ATLAS_MAP_UNTRACKED`.

**AM-3, staging first (d).** Most of this shipped in 1.25.0 as `ATLAS_MAP_UNTRACKED`. Two pieces remain:
- **The hints:** the hint of `ATLAS_UNASSIGNED_NEW`, and of any drift finding that involves a new file, says to stage before mapping.
- **A test of the 10-13 sequence:**
  1. write a file, then map before staging: the notice names the file;
  2. stage and commit both: `check` in a clean clone exits 1;
  3. map after staging: `check` exits 0.

**AM-4, "moved" (a wrong sentence).** The "What changed" counts call a file "moved" when its part changes. That includes a file going from no part into a part, which is how interlock's page said "80 files moved" for receipts that had only been given a part.
- "Moved" is kept for a file that goes from one part to another, and for a renamed file with the same content.
- A file that was in no part and now is in one is counted as given a part ("80 files given a part, across 1 part.").
- The reverse is counted too ("1 file no longer in any part").
- `fileCounts` in `page.json`, the diff and the sidecar's changes answer gains `assigned` and `unassigned`. The change is additive.

**AM-5, "People write" for data (a wrong sentence).** The Hand-authored section lists every config, data, docs and site part with no writer the map names as "People write X". For a data part, that claims more than the map knows. interlock's harness writes `receipts/` through paths built at run time and paths relative to where it runs, and the page said "People write receipts/".
- A data part with no named writer gets its own sentence, which says what is known: who commits it (people, not bots, from the history the origin already uses) and that no code the map names writes there.
- The run-time caveat ("N writes with paths built at run time may land here") stays.
- Config, docs and site parts keep "People write".

**AM-6, the failure where people look (R&D, 2026-10-13, under the Director's word to make CI failure output better).** Today `check` prints its failure shape (code, sentence, what changed, what to do) only as log text. It emits no workflow commands and writes no step summary. A failure email and the pull request's checks tab therefore say "exit code 1", and the sentence that says what to do is in the log.

When `GITHUB_ACTIONS` is `true`, `check` also emits:
- **Annotations.** Each failure becomes `::error title=<CODE>,file=<path>,line=<n>::<sentence> What to do: <fix>`.
  - Every offending file of `ATLAS_UNASSIGNED_NEW` gets its own annotation with `file=`. The other failures name no single path in their details, so they carry none.
  - A door notice carries `file=` and `line=` from the first place it was read.
  - The door notices (D1, D2) already carry `file:line` and become `::warning`. The engine and untracked notices become `::notice`.
  - GitHub shows ten annotations of each kind per step. Beyond ten, the tenth says how many more the summary holds.
- **A step summary,** appended to the file `$GITHUB_STEP_SUMMARY` names. It holds:
  - the code and its sentence;
  - the files;
  - for `ATLAS_UNASSIGNED_NEW`, AM-1's boundary lines in a fenced block;
  - for a structure change, the edges that changed, as the finding already lists them;
  - the notices.

  What a structure change reaches is left out of this slice: `check` reads the structure only. It can be added if a later measurement shows it is cheap.

The rules for both:
- **Repository strings are data.** Paths and sentences are escaped as the workflow-command format requires: `%`, CR and LF in a message, plus `:` and `,` in a property. A file whose name holds a newline and `::` cannot start a command of its own.
- **The only file written** is the one `$GITHUB_STEP_SUMMARY` names, and only when it is set. The checkout is never written, and the read-only test keeps holding.
- **Outside Actions** (variable unset, or anything but `true`) the output is byte-identical to today's.
- **Paths begin at the repository root, and a finding about a whole file sits on line 1** (amended after the live run, 2026-10-13). This item first said paths were relative to `$GITHUB_WORKSPACE`. The live run on a scratch pull request (#160) showed otherwise:
  - a job that checked out into `path: repo` gave `repo/...` paths, and GitHub showed none of them on the diff, while the same annotations from the root jobs were shown;
  - every unassigned file's error carried no line, was stored at line 0, and none was shown either.

  `file=` is now the path Atlas holds, from the repository root, always given, and with `line=1` where a finding has no line of its own.
- **The summary's file lists stop at a fixed count with "and N more",** so a failure over thousands of files stays readable and inside GitHub's 1 MiB cap on a step summary.

**Additions from R&D's review of 2026-10-13:**
- **A live run before release (required for 1.27.0).** Every AM-6 test reads stdout from a fixture, and which annotations GitHub shows, and where, is GitHub's behaviour. Before 1.27.0 ships, one real failing Actions job runs on a scratch branch: an `ATLAS_UNASSIGNED_NEW` with 12 offending files, plus a D1 notice. A second job checks out into a subdirectory (`path:`), to see where `file=` lands on the pull request's diff. The first run (#160) answered it: see the amended path item above. A second run checks the fix.
- **The test environment.** testing-os's own CI sets `GITHUB_ACTIONS` and `GITHUB_STEP_SUMMARY` for every test process. The shared test preload (`scripts/lib/git-test-env.mjs`) clears both, so a test sees on CI what it sees on a laptop and never writes into this repository's own step summary. A test that exercises them sets them on the process it starts. The release notes record:
  - the annotations in the checks tab and on the file in the pull request's diff;
  - whether the cap of ten per kind holds, with the tenth carrying the "N more" count;
  - the step summary as rendered;
  - what GitHub's failure email contains. If it does not carry the annotation text, the notes say so, and R&D and the Director decide what the email can carry.
- **Later, not in this slice:** `check` stops at the first failing comparison, so a tree with two problems needs two red runs. Reporting every failing comparison in one run is a later item, after its cost is measured.

### Acceptance (the oracle)

Every test is red on the tree before its item.

1. **AM-1.** On each fixture:
   - an interlock-shaped repository (`receipts/` with no part);
   - a top-level file outside every glob;
   - a folder a part reaches in part;
   - two folders at once;
   - a folder whose name another part already holds.

   Apply the printed lines to `atlas/boundaries.yaml`, stage, run `map`, and run `check` again. It exits 0. The output is byte-identical on Windows and Linux.
2. **AM-2.** The notice names each unassigned top-level folder with its count. It is absent when every file has a part, and `atlas/` never appears in it.
3. **AM-3.** The 10-13 sequence behaves as listed, in a clean clone.
4. **AM-4 and AM-5.** On interlock-shaped and rnd-shaped fixtures, the page never says "moved" for a file whose old or new part is none, and never says "People write" for a data part with no named writer. Config and docs parts still say "People write".
5. **AM-6.**
   - With `GITHUB_ACTIONS=true` and `GITHUB_STEP_SUMMARY` pointing at a temporary file:
     - an unassigned-new fixture gives one `::error` per offending file, with `file=`;
     - the summary holds the boundary lines;
     - a D1 fixture gives `::warning` with `file=` and `line=`.
   - A file named with a newline and `::` yields escaped output and no extra command.
   - A repository checked out into a subdirectory of `GITHUB_WORKSPACE`, or outside it, gives `file=` from the repository root, and a file-level finding gives `line=1` (amended after the live run).
   - An unassigned-new fixture with more files than the cap ends its summary list with "and N more".
   - With the variable unset, stdout is byte-identical to the 1.26.0 output on the same fixtures, and no file is written.
6. **The existing gates:**
   - `npm run verify` on a clean worktree;
   - `atlas check` on this repository;
   - the determinism tests (a clean clone, after an install, a CRLF checkout);
   - the offline and read-only tests;
   - the identity scan.
7. **A fleet count**, in a window with no grant: how many fleet repositories `map` would give the AM-2 notice today, by folder. It goes to R&D with the release.

### After the slice

AM ships in the build-up's one release, 1.27.0, cut after slice AQ (see "The release" under slices AN to AQ). It is released the same way as 1.25.0 and 1.26.0:
- the full treatment;
- the Docker image proven from the candidate tarball before publishing, and re-proven from GHCR after;
- both in a window with no grant.

## Slices AN to AQ: multi-repository Atlas

**Status:** scoped by the testing-os session, approved by R&D on 2026-10-13 in this order, with R&D's rulings folded in below. The grounding is R&D's entry `entries/2026/2026-10-13-multi-repository-atlas-research-grounding-for-the-build-up.md` in rnd: a study-swarm on four design questions, Kimi K3's consult, and R&D's rulings on it.

**What happens now.** Atlas 1.26.0 answers about one checkout per server, and its maps hold no edges between repositories. An import of another repository's published package is not an edge, so a change to a package other fleet repositories install is answered as if nothing outside its own repository used it.

**Order and size**, in sessions of the testing-os session's work, each with its fleet check:
- **AN, the surface:** about 1, plus its security review.
- **AO, the edge:** about 1.5.
- **AP, reach across repositories:** about 1.5.
- **AQ, the seeded check:** about 2, built alongside AP's end.

The smallest version worth testing is AN, AO and AP with tier 1 only.

### AN: the surface

This is slice AK (`docs/atlas-production.spec.md`, Part 1 item 6), with R&D's rulings on its roots.

- **One server, with an optional `repo` argument on every tool.** It defaults to the working repository, and names a repository by an absolute path or by a root's listed name. One server keeps the same tools for any number of repositories, where one server each would repeat every schema and every tool name on each turn.
- **The roots are fixed at start:**
  - With `atlas mcp --repos <file>`, the file is the allow-list. The client's `roots/list` is logged and not used.
  - A path in the file may be relative to the file's own directory, so an experiment commits one portable list instead of machine paths. Each path resolves to a real path at start, and `atlas_repos` reports it.
  - Without `--repos`, the roots are the working repository and the client's roots at initialisation.
  - Roots never widen after start: a later `roots/list_changed` is refused and logged.
  - The ladder always runs with `--repos`, so its roots are pinned.
- **Paths are compared as real paths,** after links resolve: junctions, and drive letters in either case. A root at a network (UNC) path is refused at start, and a junction that resolves to one is outside the roots.
- **Refusals:**
  - Anything outside the roots is `ATLAS_SIDECAR_REPO_NOT_ALLOWED`.
  - A name that matches two roots, such as two clones or worktrees with one folder name, is refused with every candidate listed. Two publishers of one package name get the same rule in AO.
- **`atlas_repos`, an eighth tool, and a cheap one.** For each root it gives:
  - its name and real path;
  - its map's commit and engine;
  - whether HEAD is ahead of the map;
  - after AO, each link's skew or orphan state.
- **Refresh keeps a cache per repository,** as now, under `LOCALAPPDATA` or `XDG_CACHE_HOME`. The cache root an experiment sets for each attempt (rnd's atlas-mcp-utility amendment 4) therefore carries over.
- **The security review,** the specialised case of the Director's Standing Rule 3:
  1. When AN's pull request is up, R&D writes a targeted brief against its head. It covers traversal, junction and link escapes, UNC paths, case-folded drive letters, roots after start, repository strings as data, and no writes outside the cache.
  2. The Director runs it by hand on Grok, Gemini or Kimi. No session calls an outside model itself.
  3. R&D also reviews the code.
  4. AN merges after both.
- **Tests:**
  - each tool with `repo`;
  - every refusal;
  - on Windows, a junction out of a root, a drive letter in the other case, and a UNC root.

  The Windows tests run in the clean verify on the rig, and in the existing Windows job where that job is already gated in. No Windows leg is added to the matrix.

### AO: the edge

- **The consumer's side.** Each import of a bare specifier records a `package-import` fact. It holds:
  - the file;
  - the package, as a purl in the Package-URL form (ECMA-427): `pkg:npm/name`, and `pkg:npm/%40scope/name` for a scoped name;
  - the declared range, from the nearest manifest;
  - the resolved version;
  - its kind.
- **Which imports count:**
  - A subpath import (`pkg/sub`) is recorded against its package.
  - `node:` builtins are not packages.
- **The resolved version** is read from `package-lock.json` (v2 or v3) or `pnpm-lock.yaml`. With a v1 lockfile, a yarn lockfile or none, it is `unknown`, with the reason, never a guess.
- **Kinds:**
  - registry;
  - `workspace:`, `file:` and `link:`, each its own kind, since their freshness moves with the tree;
  - a package importing its own name counts as the workspace kind.
- **The producer's side.** Each published package's name, version and `repository` field. Today a map records that a repository publishes, not what.
- **Two publishers of one name:** every candidate is reported, never one picked.
- **npm and pnpm come first,** because the ladder's chain is TypeScript. uv comes later.
- **The fleet check:**
  - every repository is mapped by the engine before and after;
  - 22 facts of each kind are sampled and read against the lockfile and the manifest.
- **The bar for this deterministic extractor is zero wrong facts in the sample.** Any wrong fact is a defect, fixed at its class before the wave. "Provisional under 20" stands for a kind with fewer facts.
- **It changes every map,** so it ships with the pin wave.

### AP: reach across repositories, tier 1

- **The join is made at query time and stored in no map,** so each map stays a fact about its own repository, and the one-map-per-repository rule is unchanged.
- **For a file in repository X,** the join finds:
  - the packages X publishes that contain the file;
  - then the roots whose maps declare those packages.

  Each link gives the declared range, the resolved version, both map commits and its basis.
- **Basis:**
  - attested;
  - the `repository` field;
  - manual, meaning a mapping declared in the consumer's `atlas/boundaries.yaml`, never inferred.

  The answer names each link's basis.
- **Skew is `match`, `ahead`, `behind` or `unknown`.** It's decided from the producer's release tag or release run for the resolved version.
  - `unknown` is the default, and it is never read as `match`.
  - When the commit that published the resolved version holds a map, the join walks that map. This extends `--ref` reading, which today covers `explain` and `gaps`, to reach and the sidecar.
  - Otherwise the join uses the checkout's map and states the skew.
- **Orphan:** a declared producer with no map in the roots.
- **The wording** is "2 of 3 consumers in this workspace declare it", never "will break".
  - A semver bump is shown as context only.
  - `cannotSee` lists unmapped or private consumers, runtime loading, the installed version, and whether downstream tests cover the call site.

### AQ: the seeded check and the inferred tiers

**The bar, set by R&D on 2026-10-13, before any mining:**
- **The inferred tiers never remove a tier-1 consumer from an answer.** They annotate and rank, for example "of 3 declaring consumers, 2 import the changed export (inferred)". A miss in tier 2 or 3 then hides nothing tier 1 shows. Recall is the safety number, and precision the attention number.
- **A tier turns on only if all three hold:**
  - a seed of at least 20 breaking-change cases;
  - recall at least 0.8 on the Wilson 95% lower bound;
  - precision at least 0.8 as a point estimate.

  Otherwise it stays off, and the release says why.
- **The labels:**
  - a positive is a consumer that adapted to the producer's change, or went red on the bump;
  - a consumer that never adopted the version is excluded, not counted as a negative;
  - only changes that removed or broke an export count, not compatible additions.

**The seed** is mined from fleet history, never from Atlas's output. Each case is a producer commit that changed or removed an export, paired with a consumer commit that adapted to it or a consumer CI run that went red on the bump.

**The tiers it gates:**
- tier 2, a value import of the changed export (inferred, a runtime consequence);
- tier 3, a type-only import (inferred, a build consequence; a type change can be compatible, so it reports use, not breakage).

**The report** gives precision and recall per tier, with the seed's size and its repositories. If fleet history yields too few cases, it says so, and the tier stays off.

### The release

- **One pinned release for the whole ladder,** cut when AQ reports. It holds AM, testing-os#158 and slices AN to AQ.
  - The inferred tiers are on if they pass, and off with the reason if not.
  - The ladder isn't held for a second AQ attempt, and the engine doesn't change mid-ladder.
  - A tier that passes later is evaluated in its own amendment, not inside the ladder.
- **Then one pin amendment in rnd,** written by R&D. It carries:
  - the Claude Code CLI at 2.1.296 or later;
  - the init fixtures re-captured, with `repo` and `atlas_repos` in the captured schemas;
  - a stream-level check that every `tool_use` is in the arm's set;
  - `git -C <repo>` per repository;
  - generalised `mcp__atlas__` keying;
  - the rnd #13 points.

### Acceptance (the oracle)

- **AN:** every test above passes in a clean verify and in CI; the security review's findings are closed; R&D passes the pull request.
- **AO:**
  - zero wrong facts in the fleet sample;
  - every fact other than the new ones is byte-identical before and after, on this repository's fixtures and on the fleet clones.
- **AP:** fixtures with known consumers give each skew state, an orphan, and each basis. No answer says "will break".
- **AQ:** the report applies the bar above, as written here before mining.

## Later items

Each gets its own section here, for R&D's review, before it starts.

- **Instruments and the experiment.**
  - `instruments/atlas.md` and `instruments/testing-os.md` are in rnd #3.
  - The experiment's spec goes in rnd under `experiments/atlas-mcp-utility/` before any run. It is pre-registered:
    - at least 20 paired tasks from fleet history with mechanically checked answers;
    - one model and one prompt per arm, the only difference being whether `atlas mcp` is available;
    - correctness by paired McNemar; tokens and tool calls by paired ratio with an exact Hodges–Lehmann interval; wall time recorded but not gated;
    - stop rules, refusal handling, and grading code pinned before the run;
    - a price.
  - No run without the Director's go on the token budget.
  - The probes and the pilot wait for the build-up's release (the order above).
- **The exit test** (`docs/atlas-production.spec.md`, acceptance 11): the 2026-09-30 triage replayed on the clones it used, built so its tasks are the experiment's bank.
- **Slice AK** is slice AN above.
- **The landing page's Atlas section,** last.
- **The `test_fake_hides_platform` check,** alongside the rest. Two shapes from interlock's history:
  - a `run` or `subprocess.run` called without capturing output, whose `.stdout` is then read;
  - a live builder whose injectable seam defaults to a constant `None`.

  What counts as a finding is pre-registered and sent to R&D first. Then it runs over the fleet, and the hit list goes to R&D, who judges precision against interlock's history. Where the check lives is decided in its own section.

## Standards compliance

- **PIN_PER_STEP 2.** The fleet stays on one pinned engine until a wave moves it by pull request. Each map records its engine, and each build is a branch with its tests.
- **ANDON_AUTHORITY 2.** A red test, a red `check` or a failed proof stops the slice. A held GPU grant stops any heavy step until "grant end".
- **NAMED_COMPENSATORS 2.** Table below.
- **DECOMPOSE_BY_SECRETS 2.** What a repository's parts are stays in its `atlas/boundaries.yaml`. AM only suggests lines, and a person or agent decides. How the check words its output stays in the adapter. Each map stays a fact about its own repository: the join across repositories is made at query time and stored in no map.
- **UNCERTAINTY_GATED_HUMANS 2.** R&D rules scope before each slice and reviews each pull request. The Director is asked about the experiment's token budget, the pin wave and AN's outside-family review, nothing else.
- **EXTERNAL_VERIFIER: conditional.** No verifier pass for AM, testing-os#158, or AO to AQ; AQ's bar is a measurement, set before mining. AN's one targeted security review is the specialised case: R&D writes the brief, the Director runs it by hand on Grok, Gemini or Kimi, and R&D reviews the code too. Nothing here calls Ollama Cloud.

| Irreversible action | Undo | State after | Owner |
|---|---|---|---|
| `npm publish` of 1.27.0 | `npm deprecate` the version, then a patch release | The bad version stays installable but warns; the patch is `latest` | testing-os session |
| Release tag and GitHub release | Delete the release and the tag | No release page; npm unaffected | testing-os session |
| GHCR image `ghcr.io/dogfood-lab/atlas:1.27.0` | Delete the package version | The previous image stays `latest` | testing-os session |
| A merged pull request in interlock or rnd | A revert pull request | The previous map and boundaries | The Publisher (interlock), R&D (rnd) |
| A merged pin-wave pull request in any other fleet repository | A revert pull request | The previous pin and map | testing-os session |
