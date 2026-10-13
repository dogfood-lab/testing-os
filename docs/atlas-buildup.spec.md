# Atlas and testing-os: the build-up before the next pin wave

**Status:** slice AM approved by R&D on 2026-10-13, with four additions to AM-6, folded in below. The Director set the direction: build up Atlas and testing-os before the fleet moves off Atlas 1.24.0, with R&D shaping the work. The Research and Development session rules scope and reviews each pull request with "[R&D]" verdicts. The Publisher holds the 5090 card grants and decides merges in interlock and rnd. The testing-os session builds.

**Order (R&D, 2026-10-13):** slice AM (below), then Atlas and testing-os as rnd instruments with a pre-registered experiment, then the exit test, then slice AK, then the landing page. The `test_fake_hides_platform` check runs alongside.

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
- A file that was in no part and now is in one is counted as such ("80 files that belonged to no part now belong to one").
- The reverse case is counted as such too ("3 files no longer belong to any part").

**AM-5, "People write" for data (a wrong sentence).** The Hand-authored section lists every config, data, docs and site part with no writer the map names as "People write X". For a data part, that claims more than the map knows. interlock's harness writes `receipts/` through paths built at run time and paths relative to where it runs, and the page said "People write receipts/".
- A data part with no named writer gets its own sentence, which says what is known: who commits it (people, not bots, from the history the origin already uses) and that no code the map names writes there.
- The run-time caveat ("N writes with paths built at run time may land here") stays.
- Config, docs and site parts keep "People write".

**AM-6, the failure where people look (R&D, 2026-10-13, under the Director's word to make CI failure output better).** Today `check` prints its failure shape (code, sentence, what changed, what to do) only as log text. It emits no workflow commands and writes no step summary. A failure email and the pull request's checks tab therefore say "exit code 1", and the sentence that says what to do is in the log.

When `GITHUB_ACTIONS` is `true`, `check` also emits:
- **Annotations.** Each failure becomes `::error title=<CODE>,file=<path>,line=<n>::<sentence> What to do: <fix>`.
  - `file=` is given when the finding names exactly one tracked path, and `line=` when it names a line.
  - Every offending file of `ATLAS_UNASSIGNED_NEW` gets its own annotation.
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
- **Paths are relative to `$GITHUB_WORKSPACE`, not the repository root,** because GitHub resolves `file=` against the workspace. When the repository root is inside the workspace (a checkout with `actions/checkout`'s `path:`), the path is given relative to the workspace. When it is not, `file=` is left out.
- **The summary's file lists stop at a fixed count with "and N more",** so a failure over thousands of files stays readable and inside GitHub's 1 MiB cap on a step summary.

**Additions from R&D's review of 2026-10-13:**
- **A live run before release (required for 1.27.0).** Every AM-6 test reads stdout from a fixture, and which annotations GitHub shows, and where, is GitHub's behaviour. Before 1.27.0 ships, one real failing Actions job runs on a scratch branch: an `ATLAS_UNASSIGNED_NEW` with 12 offending files, plus a D1 notice. The release notes record:
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
   - A repository checked out into a subdirectory of `GITHUB_WORKSPACE` gives `file=` relative to the workspace. A repository outside the workspace gives no `file=`.
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

Release 1.27.0, the same way as 1.25.0 and 1.26.0:
- the full treatment;
- the Docker image proven from the candidate tarball before publishing, and re-proven from GHCR after;
- both in a window with no grant.

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
- **The exit test** (`docs/atlas-production.spec.md`, acceptance 11): the 2026-09-30 triage replayed on the clones it used, built so its tasks are the experiment's bank.
- **Slice AK** (`docs/atlas-production.spec.md`, Part 1 item 6): each sidecar tool takes `repo`. Its one security review covers:
  - path traversal and symlinks out of the allowed roots;
  - an allow-list of roots rather than any path;
  - repository strings staying data when they come from another repository's map;
  - no writes.
- **The landing page's Atlas section,** last.
- **The `test_fake_hides_platform` check,** alongside the rest. Two shapes from interlock's history:
  - a `run` or `subprocess.run` called without capturing output, whose `.stdout` is then read;
  - a live builder whose injectable seam defaults to a constant `None`.

  What counts as a finding is pre-registered and sent to R&D first. Then it runs over the fleet, and the hit list goes to R&D, who judges precision against interlock's history. Where the check lives is decided in its own section.

## Standards compliance

- **PIN_PER_STEP 2.** The fleet stays on one pinned engine until a wave moves it by pull request. Each map records its engine, and each build is a branch with its tests.
- **ANDON_AUTHORITY 2.** A red test, a red `check` or a failed proof stops the slice. A held GPU grant stops any heavy step until "grant end".
- **NAMED_COMPENSATORS 2.** Table below.
- **DECOMPOSE_BY_SECRETS 2.** What a repository's parts are stays in its `atlas/boundaries.yaml`. AM only suggests lines, and a person or agent decides. How the check words its output stays in the adapter.
- **UNCERTAINTY_GATED_HUMANS 2.** R&D rules scope before each slice and reviews each pull request. The Director is asked about the experiment's token budget and the pin wave, nothing else.
- **EXTERNAL_VERIFIER: conditional.** No verifier pass for AM. AK's one targeted security review is the specialised case. Any outside-family check is run by the Director by hand, and nothing here calls Ollama Cloud.

| Irreversible action | Undo | State after | Owner |
|---|---|---|---|
| `npm publish` of 1.27.0 | `npm deprecate` the version, then a patch release | The bad version stays installable but warns; the patch is `latest` | testing-os session |
| Release tag and GitHub release | Delete the release and the tag | No release page; npm unaffected | testing-os session |
| GHCR image `ghcr.io/dogfood-lab/atlas:1.27.0` | Delete the package version | The previous image stays `latest` | testing-os session |
| A merged pull request in interlock or rnd | A revert pull request | The previous map and boundaries | The Publisher (interlock), R&D (rnd) |
