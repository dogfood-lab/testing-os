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
- **Paths are compared exactly as real paths,** after links resolve, each root resolved once and kept (amended after the outside review, 2026-10-13).
  - On Windows the native real path carries each name's case as it is on disk, so a drive letter in either case resolves to one string. A path that matches a root only in case is another directory and is refused.
  - A root at a network (UNC) path is refused at start, and a junction or a mapped drive that resolves to one is outside the roots. A mapped drive was checked by hand on the rig.
  - git runs in the root's real path, without `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR` or `GIT_NAMESPACE`, and `show` and `diff` run no textconv filter or external diff.
  - A tree exported without its history is a root only at the directory that holds `atlas/structure.json`, never found by climbing to an ancestor. Started inside one, the server names its top.
  - A `--repos` file's relative lines resolve from the directory it really is in.
  - Client roots past 32 are dropped and logged.
- **Refusals:**
  - Anything outside the roots is `ATLAS_SIDECAR_REPO_NOT_ALLOWED`.
  - A name that matches two roots, such as two clones or worktrees with one folder name, is refused with every candidate listed. Two publishers of one package name get the same rule in AO.
- **`atlas_repos`, an eighth tool, and a cheap one.** For each root it gives:
  - its name and real path;
  - its map's commit and engine;
  - whether HEAD is ahead of the map;
  - after AO, each link's skew or orphan state.
- **Refresh keeps a cache per repository,** as now, under `LOCALAPPDATA` or `XDG_CACHE_HOME`. The cache root an experiment sets for each attempt (rnd's atlas-mcp-utility amendment 4) therefore carries over. Its checkout fingerprint hashes a link's text and never follows it.
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

The shape below is R&D's ruling of 2026-10-13, which replaced a literal reading of this section that put the range, version and kind on every import. It holds the same facts without repeating a declaration on every file, and it keeps the declarations AP's tier 1 needs: a CLI run from a script, a peer and a types package are consumers that no import shows. The page is unchanged.

- **`manifests`:** every tracked `package.json`, as `{ path, role, roleFrom, name, version, private }`.
  - One role per manifest, by precedence: `root`, then `member` (the workspace's `workspaces` or `pnpm-workspace.yaml`), then `installed` (a door's step runs `npm ci`, `npm install`, `pnpm install` or `yarn` there, read as the D2 check reads a step, through `working-directory`, `cd x &&`, `--prefix`, `--dir` and `--cwd`), then `other` (fixtures, examples, templates), said as "no workspace lists it and no install step Atlas reads runs in its directory", since a step may install a copy of it elsewhere.
  - `roleFrom` says how the role was known, as every Atlas fact does: "the root manifest", "workspaces in package.json", "door Site, job build, step Install: npm ci in site".
  - AP's tier 1 counts `root`, `member` and `installed` declarations, and lists `other` in `cannotSee`. A fixture's facts stay true without making its repository a consumer.
- **`packageDependencies`:** every declaration in every manifest, as `{ manifest, field, name, purl, range, kind, version, versionFrom | unknown }`, with `alias`, `repository` and `kindFrom` where they apply.
  - The purl follows Package-URL (ECMA-427): `pkg:npm/name`, `pkg:npm/%40scope/name`, with no version.
  - Kinds: `registry`; `workspace`, `file` and `link`, which move with the tree; `git`; `url` (a tarball).
  - A name the lock links to a member's directory is `workspace`, with `kindFrom`, whatever its range says: npm workspaces declare a sibling with a plain range.
  - An `npm:` alias is the package it names, with `alias` kept beside it.
  - A git dependency records its repository as `https://host/owner/repo`, and as `version` the 40-hex commit its lock pins. When that commit holds a package under another name, the purl is that package's, with the declared name as `alias`. A git dependency on a fleet repository carries an exact commit, the strongest cross-repository edge there is.
  - The version is read from the tracked `package-lock.json` (v2 or v3) or `pnpm-lock.yaml` (v6 or v9) at or above the manifest, and only for a manifest that lock installs: its own directory, or a member it lists. A fixture below a lock gets no version from it. Anything else (a v1 lock, `npm-shrinkwrap.json`, yarn, bun, none, a pinned value that is not a version or commit) is `unknown`, with the reason, never a guess.
- **`packagesPublished`:** each manifest a door publishes to npm, as `{ manifest, name, purl, version, repository, doors, how }`.
  - It covers a package the publish names, one a loop over a glob finds, every member, the members a loop over the workspace picks, or the one package under a directory that the tag or the run picks. A publish in a job an `if:` holds counts.
  - `how` says which: "named by the publish", "a loop over packages/*/", "every member of the workspace", "a loop over the members of the workspace", "one package under packages/, chosen by the tag".
  - A private manifest is never in it, and a publish whose packages only a run decides is not expanded.
- **Each JavaScript or TypeScript file's `packages`:** `[{ purl, manifest, self? }]`, the packages its bare imports name.
  - **What is not a package** (R&D's review of #173): a specifier starting with `#`, a name npm's rules for existing packages reject (`validForOldPackages`, so `JSONStream` stays and `@/lib` and `$lib` go), and a name the resolver found in a tracked file when no manifest declares it and it is no workspace member. Each is left out and counted in statistics.json under `packageImports`: sites by reason, the files they are in, and the twenty most common names left out.
  - A tracked file reached through a declared name, a workspace member's name (declared or not: a monorepo's members import each other by name without listing each other) or a package's own name stays, since the workspace and self kinds are those. The first fleet pass of this fix showed why: every one of 132 undeclared in-repository sites in five monorepos was a workspace member, and none was an alias.
  - Imports counted: static, dynamic with a literal name, and `require`. A subpath counts against its package.
  - Built-ins, a scheme's modules (`astro:content`) and `require.resolve` are not packages.
  - `manifest` is the nearest manifest above the file that declares the name or its types package, found as resolution finds it, or null when none does. An alias records the package it names. A package importing its own name is `self`.
- **Built-ins are told apart by a list fixed in the engine:** Node 22's `builtinModules`, the oldest Node the engine supports. A prefix-only built-in (`node:test`, `node:sqlite`) counts only with its prefix.
  - The running Node's list would put the classification in structure.json, so a map made on Node 24 and checked on Node 22 could disagree.
  - A test maps a fixture under a preload that changes the running list, and requires the same bytes.
- **Two publishers of one name:** every candidate is reported, never one picked.
- **npm and pnpm come first,** because the ladder's chain is TypeScript. uv comes later.
- **The fleet check:**
  - every repository, and every fixture here, is mapped by the engine before and after;
  - 22 facts of each kind (manifest roles, declarations, file imports, published packages) are sampled and read against the lockfile, the manifest and the workflows;
  - the sample includes a repository with a pnpm lock, one with an alias or a git dependency, a workspace with a private member, testing-os for its fixture manifests, and a repository whose separate packages doors install with no workspace.
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
  - every byte of structure.json, page.json, README.md and statistics.json is identical before and after, on this repository's fixtures and on the fleet clones, except the new facts (`manifests`, `packageDependencies`, `packagesPublished`, each file's `packages`, and statistics.json's `packageImports`) and the dates (`generatedAt`, the dated line). AO adds no format version.
- **AP:** fixtures with known consumers give each skew state, an orphan, and each basis. No answer says "will break".
- **AQ:** the report applies the bar above, as written here before mining.

## Amendments of 2026-10-15: the consult on AO to AQ, the release and the wave

**Status:** from the Publisher's consult of Argon (a different model family) on the rest of the build-up, with the Publisher's dispositions and R&D's ruling on question 1. Argon had no repository access for this round, so these are the dispositions, not Argon's text; the two items that depend on the code (adapter/diff.js:28 and the sidecar's git calls) were checked against testing-os at `228777d2`. Each item below amends the section named. Nothing here changes an earlier ruling that it does not name.

### AO and AQ: where the import names go (R&D's ruling on question 1)

**Ruled:** AO records the packages a file's imports name (`packages: [{ purl, manifest, self?, member? }]`) and nothing about what an import binds. **AQ adds the per-import record, `names` (named, default, namespace) and `typeOnly`.**

**Why:** the extractor keeps only `{ specifier, kind, line }` for an import, so recording names is new extraction, not a rename of AO's facts. AO and AQ ship together in 1.27.0 and no fleet map is regenerated between them, so the map format changes once for every reader whichever slice carries the fields. Putting them in AQ keeps AO's byte-identical oracle exact (its only exclusions are the four new keys and the dates) and keeps AO's recall check meaningful. Argon's alternative, to fold them into AO so the schema locks once, gives readers nothing they do not get from this plan; the ruling is recorded here so it is not reopened.

**Conditions:**
1. **AQ's new fields get a sampled precision check:** 22 import sites per kind, fixed seed, zero wrong. The kinds are a value import, a type-only import, and a re-export or namespace import where the parser sees them. They also get a **recall check:** an independent text read of the `import type` and named-import sites across the fleet's TypeScript files, compared with what AQ records, in the spirit of AO's publish recall.
2. **If AQ slips out of 1.27.0, AO ships alone.** The fields then arrive later as a purely additive minor change: new optional keys only, no renames and no change to an existing key's meaning.
3. AQ's own byte-identical check compares against AO's output and excludes only AQ's new keys.

### AP: reach across repositories (additions)

- **`cannotSee` names the ecosystems Atlas does not extract** (PyPI and uv, Cargo, NuGet) and the roots it was not given. **When any of that applies to the package asked about, reach does not answer "zero consumers".** It answers that the consumers are unverified and names what it could not read. A zero is only said when nothing Atlas cannot see could hold a consumer.
- **Git calls that take a ref from another repository.** Every such call (a ref read from a lockfile, a release or a tag) refuses any value that begins with `-` before it spawns git, and passes `--end-of-options` (with `--verify` on `rev-parse`) before the ref. A tag is named in full as `refs/tags/<name>` and validated with `git check-ref-format`. (`--` separates paths, not revisions, so it is the wrong tool here. The sidecar's calls already run `rev-parse --verify --quiet --end-of-options` at `sidecar/git.js:107` and `:151`, and use `--end-of-options` at `sidecar/changes-tool.js:38`. What is new is the refusal before the spawn, for every external ref, not only tags.)
- **`adapter/diff.js:28`'s `rev-parse` call lacks `--end-of-options`.** It is fixed in AP, since that is the path a ref taken from data reaches.
- **AP gets a targeted security review before it merges,** as AN did: R&D writes the brief against AP's head, the Director runs it by hand on another family, and R&D reviews the code. This is the specialised case under the Standing Rules.

### AQ: the mining (additions)

- **The mining of fleet history is limited to one session.**
- **Under 20 cases:** the report logs what was scanned (the repositories, the commit range and the case count), keeps the inferred tiers off, and the release is cut with them off. The release is not held for a second attempt (this restates the release section's rule).
- The seed's repositories include incontrol and interface-audits (see the wave).

### AQ as ruled (R&D, 2026-10-15)

- **AQ-1, the per-import record, is required in 1.27.0; AQ-2, the tiers and the mining, is optional** and its tiers stay off, with the reason stated, if the seed falls short. The forecast is accepted: the fleet's code-level cross-repo consumption is about 44 pairs from five producer repositories (141 pairs in all; 97 are the theme package), so the seed will probably fall short.
- **Package imports only,** under each file's `importNames`; relative imports are file edges already. A name is the name the module exports, never the alias; `default` and `*` mark the default export and the whole module; a name only used as a type is `type: true`, and a site is `typeOnly` when every name is (the mixed `import { a, type B }` is not).
- **Edge cases of the record (R&D's review of #180):** past the 50-name cap a site says `*` and keeps the type mark when every name was a type; a file keeps 200 sites and says how many it left out; `import {} from …` still loads the module and carries `sideEffect: true` (an `import type {} from …` does not); an `import()` written as a type is `type-import`, found from its ancestors, and a `typeof` applied to an `import()` is a type query wherever the grammar puts it.
- **Re-exports in the tiers:** the asked file's own exports plus the entry's named re-exports and `export *` the parser sees, followed inside the package with a cycle guard and a depth of 5. What cannot be followed is "cannot tell", never "no". The tiers are not limited to entry files.
- **Mining (AQ-2):** step 0 first: count the candidate producer commits that removed or renamed an export, across the producers, with text tools only. Under 20 the bar is unreachable: report the count, the repositories and the commit range, keep the tiers off, and stop. Case selection never uses the engine's parser (the recall would be measured only on exports the parser sees). Labels come from consumer history and GitHub CI conclusions read through `gh`; a red run counts toward a positive only when it ran on the consumer's bump commit and the next commit that turns it green touches a file that mentions the changed name, and the run id is recorded with each label. Fleet history is the population; public dependents are not added. The protocol file is committed first in AQ-2, before any mining output.

### The release (additions)

- **In 1.27.0 beside the ladder:** #171 (the upload-sarif sentence, its own small pull request, after AO), and the Dependabot pull requests #152 and #153. #155 (routing each approved finding to its owning domain) changes routing semantics and is deferred to 1.28.0.
- **The swarm's Atlas pin.** The release commit sets the dogfood-swarm `ATLAS_VERSION` to 1.27.0 with its pin test, which runs against the candidate before it is published, and #154 is closed then.
- **The second AM-6 live run** (scratch pull request, GitHub's runners) runs now, on main after #163, #165 and #167, and **once more on the 1.27.0 candidate.** Both go on the AM-6 record.
- **No package version bumps in the wave** (the Director, 2026-10-15): each wave pull request is the pin and the regenerated map only, as in the 1.24.0 wave. The release itself stays lockstep.

### The wave (additions)

- **A canary first:** interlock, rnd, a Python repository, a pnpm monorepo and a Rust or C# repository, with the incontrol and interface-audits first maps and their one-leg `atlas check` steps. **Then the other 94**, once the canary is green.
- **Unassigned-folder notices go in the pull request bodies.** Atlas does not edit folder ownership, and the folder fixes go to housekeeping after the wave.
- **incontrol and interface-audits join the fleet clone set** for AM item 7's count, AO's fleet check and AQ's mining. That needs no commit in either repository, because `map` runs on the clones. Their committed first maps land in the wave's first stage, at 1.27.0, so each is mapped once by the release engine instead of at 1.26.0 and again at 1.27.0.
- **rnd's pin amendment stays its own pull request.** The "pin amendment in rnd" in the release section is the atlas-mcp-utility experiment's amendment (the CLI, the init fixtures, the stream check, `git -C`, the keying, the rnd #13 points), under R&D's review. It is not rnd's CI pin; rnd's wave pull request already carries its pin and its regenerated map in one commit, which is what the org rule asks. It is not folded into the wave pull request.
- **Scratch clones.** Any fleet clone-and-map is made in a scratch folder of the testing-os session's own, never in a seat's worktree, and waits for the rig-load rule.

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
