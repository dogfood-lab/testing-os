# Atlas — design dispatch

> **Status: engine record; output superseded (2026-09-22).** The engine described here is
> built. What Atlas *produces* is now specified by [atlas-page.spec.md](atlas-page.spec.md),
> which wins over §5, §7 and §8 of this document wherever they differ: there are no profiles,
> no acceptance ladder, and no human-authored boundary sentences. The rest of this document
> remains the record of how a repository is read.

`@dogfood-lab/atlas` is the eighth workspace package. It reads a git repository and derives a
map of how that system operates, then renders it for three audiences. Its purpose is to keep
the human nominally responsible for a repository actually able to describe it, at a point where
increasingly much of the code was not written by a human at all.

---

## Standards compliance

Scored against the six workflow standards (`.claude/rules/workflow-standards.md`), 0–3.

**DECOMPOSE_BY_SECRETS is a 3. PIN_PER_STEP is a 3. ANDON_AUTHORITY is a 3. UNCERTAINTY_GATED_HUMANS is a 2. Every other score here is a 1.** A 2 means a step already does
the thing; a 3 means that step has tests. Slice 1 landed the read-only core and the two tests
that enforce the split. Slice 2a landed the grammar-manifest test, which is what moves
PIN_PER_STEP to 2. Slice 5 landed the byte-identical statistics fixture, which is what moves
PIN_PER_STEP to 3. Slice 3 landed the host check, which is what moves ANDON_AUTHORITY to 2.
Slice 9 landed the weekly job's per-repository failure path, which is what moves ANDON_AUTHORITY to 3.
Slice 4 landed the acceptance ladder, which is what moves UNCERTAINTY_GATED_HUMANS to 2.
The other standards are still specified in prose and enforced nowhere.
The trajectory dispatch in this same folder was previously caught inflating a score by describing
a gate it had not yet built. **Rescore upward only in the commit that lands the enforcing test**,
never in a design edit.

| Standard | Score | What is specified, and what would raise it |
|---|---|---|
| PIN_PER_STEP | 3 | The four grammar files are vendored from `@vscode/tree-sitter-wasm` 0.3.1 and `core/grammar-manifest.test.js` re-hashes each file against `grammars/manifest.json`. `adapter/determinism.test.js` proves two maps at one commit write byte-identical `statistics.json` apart from `generatedAt`, and the artifact records the window, thresholds and floor actually used. |
| ANDON_AUTHORITY | 3 | `atlas check` fails the host on structural drift, and `adapter/lifecycle.test.js` covers that halt. A thrown map in the weekly job is recorded against that repository and the loop continues, and `scripts/atlas-render.test.mjs` covers that path. |
| NAMED_COMPENSATORS | 1 | Specified: four irreversible actions, each with an undo, a post-rollback state and an owner slot. See **Compensators**. Three of the four owners are unfilled seats, which is itself why this cannot read higher. **→ 2** when the undos are documented operator procedure with seats named. **Remediation:** slice 9, owner unassigned (§12). |
| DECOMPOSE_BY_SECRETS | 3 | The core at `packages/atlas/core/index.js` reads a repo path and parsed boundaries and returns data. `core/no-sibling-imports.test.js` walks the resolved import closure and fails on any `@dogfood-lab/*` edge. `core/writes-nothing.test.js` fails if a run changes the fixture tree or the process working directory. |
| UNCERTAINTY_GATED_HUMANS | 2 | Acceptance fails while a reason or a will_break is still derived or still the sentence init would write, and `adapter/ladder.test.js` covers that gate. A correct derived entry point is never retyped. Low-confidence labels on the fallen floor are still only specified. **→ 3** when those labels propagate through the ladder. **Remediation:** slice 5, owner unassigned (§12). |
| EXTERNAL_VERIFIER | **skip** | `skip:` no model generates any Atlas output. The standard requires a verifier from a different model family with the generator's reasoning hidden, and there is no generator to hide. A second independent implementation of boundary membership is a different and weaker requirement, and claiming it as this standard would be a category error. **Revisit this skip if a later slice introduces a model**, for example a generated Orientation draft. |

One skip, with its reason. DECOMPOSE_BY_SECRETS is 3 because its two tests pass. PIN_PER_STEP is 3 because the grammar-manifest test and the statistics determinism test pass. ANDON_AUTHORITY is 3 because the host check is tested and the weekly job's per-repository failure path is tested. UNCERTAINTY_GATED_HUMANS is 2 because the acceptance ladder is tested. No score is above what exists.

---

## 1. The decisions

Settled across the consult. Each is here with the reason, so a later session can overturn it on
argument rather than on preference.

**1.1 Home.** The eighth package in this repository, not a new one. A mapper needs a schema
spine, an evidence store, a docs site, CI and release rails; all five exist here. A new
repository means building those before drawing a single box, and this studio has a design tree
that has sat unbuilt at Phase 0 for months as evidence of how that ends. The publish workflow
enumerates `packages/` at runtime and skips `private: true`, so a new public package joins the
publish and the lockstep version guard with no workflow edit. The cost of living here is the
lockstep bump every other package already pays.

**1.2 Name.** `@dogfood-lab/atlas`, executable `atlas`, subcommands `atlas init`, `atlas map`,
`atlas check`. Not "domain" anything: inside this repository that word already means the
agent-ownership ledger in `swarms/`, and a package named for it would be read forever as an
upgrade to that. Not "map" as the package name either, which is the vaguest available label for
a public package and collides with the language's own built-in. An atlas is a bound set of views
of one territory at different scales, which is what this is.

**1.3 Read-only core.** The core takes a repository path and a boundary file and returns data.
It writes nothing: no files, no logs, no database, no output. The adapter above it writes. Neither layer imports a sibling package. The core is kept sibling-free so it can be lifted out; the adapter is kept sibling-free because the published binary runs inside consumers' test jobs, where no @dogfood-lab/* package is installed. The closure test enforces this for the whole package by rejecting any sibling as a dependency key. This exists so the core is liftable into its own repository later
as a move rather than a rewrite, and it is shaped rather than merely ruled: a core forbidden to
import siblings but required to write would have to fork this repository's atomic-write and
staged-logging helpers, which is the copy-paste-fork that `CLAUDE.md` says the accepted
package cycle exists to avoid. That fork did happen, once, deliberately and in the adapter rather than the core: adapter/write.js duplicates the findings atomic-write helper, is allowlisted in the writer sweep with that reason, and is the price of a binary that installs on its own.

Two required tests, both in the core's own suite:

- Walk the resolved import graph from the core entry point and fail on any `@dogfood-lab/*`
  edge, declared **or transitive**. Declared dependencies alone are insufficient; an edge can
  arrive through a leaf helper.
- Run the core against a fixture with the working tree watched, and fail if anything was
  written. This catches a dynamic import that the graph walk cannot see.

Third-party parser libraries are fine.

**1.4 The evidence atom is the file.** Git, churn, co-change and imports all speak files. A
symbol is never a node. Symbols are a detail inside a boundary on the Dev view.

**1.5 A boundary's identity is its name; its extent is a glob set.** A glob does not survive a
rename, so the glob cannot be the identity. A rename must surface as drift against a boundary
that keeps its name and its history. The glob set matches how ownership is already expressed in
`swarms/`, which keeps a later join possible, but the two files stay separate: the swarm ledger
says who may edit a path, the boundary file says what a boundary is called, why it exists, and
where a newcomer starts.

**1.6 Languages.** TypeScript, TSX, JavaScript and Python in version one, covering roughly four
in five repositories in the fleet. Everything else is a real stub: files, history and co-change,
with symbols and imports marked unavailable on those paths. A missing import graph renders as
missing, never as absence of edges.

**1.7 Parsers ship as WebAssembly.** The native tree-sitter binding loads a prebuilt only when
one matches both platform and Node ABI and otherwise compiles through `node-gyp`; prebuild gaps
on recent Node versions are a filed issue, and this repository's own matrix runs Node 22 and 24.
A tool whose entire promise is that it runs inside whatever test job a repository already has
cannot have an install step that sometimes compiles C++. `web-tree-sitter` runs in Node, and the
four grammar files are **vendored into the package, version-pinned and hash-checked**, rather
than taken as a dependency on a bundle that would install an entire language zoo into every
consumer's test job. The speed penalty is real and is the correct trade.

TypeScript, TSX and JavaScript are three separate grammars sharing one runtime, so the extractor
dispatches on extension across four grammars, not two front-ends. If a fixture suite later shows
the Python grammar too thin to recover imports, Pyright is the escalation to evaluate: it is a
TypeScript program and needs no CPython. It is not a version-one dependency.

**1.7a Specifier resolution is version one, not a later phase.** Tree-sitter reads a file, not a
project. It never evaluates `tsconfig.json`, so a path-aliased import resolves to nothing by
default. Deferring this would not yield a mostly-correct map with a warning; for an affected repository
it yields a matrix with almost no internal edges and an unresolved count in the thousands, which
is precisely the confidently wrong map this design exists to prevent.

Measured in this workspace at the time of writing, excluding vendored dependency directories and
searching four levels deep: nine `tsconfig`/`jsconfig` files across five trees carry `paths`
mappings. An earlier draft said fourteen; that number counted vendored files inside a virtual
environment and is withdrawn. The qualitative split is what matters and it holds: the flagship
repositories use no aliases at all, importing by relative path and by workspace package name,
while a handful of other local trees do. The hazard is real for part of the fleet while missing
the front of it.

**Resolution reads the file tree, and that is permitted.** The read-only rule of §1.3 forbids
writing, not reading; a resolver that cannot probe for a sibling file is not a resolver.

**Do not hand-roll conditional `exports`.** Modern export maps are nested conditional objects
with `import`, `require`, `default` and custom conditions, not flat tables, and a naive string
match against them returns the empty matrix by yet another door. The JavaScript and TypeScript
side uses an existing pure-JavaScript resolver — `enhanced-resolve` is the battle-tested
candidate, with no native build — configured with the alias mappings. Python keeps a hand-written
rule, because no such library applies to it.

**One caveat that a runtime resolver gets wrong and Atlas must not, and it has to fail closed.**
A resolver answers what the runtime would load, which for a compiled package is a built artefact
under `dist/`. Atlas maps source. An edge pointing at a generated file is not a near miss; it
would draw the compiled shadow of the repository instead of the repository.

Preferring a "source" condition does not fix this, because export maps in the wild publish
`import`, `require`, `default` and `types` and essentially never publish `source`. Preferring a
condition nobody ships falls straight through to the build output. Two mapping attempts, in
order, then a hard stop:

1. **The emitted file's source map**, `.js.map` or `.d.ts.map`, and **only when it names exactly
   one in-repository source**. A bundler emits one chunk from many sources, and the map then
   lists all of them. Extraction here is lexical — §1.4 makes a symbol never a node — so Atlas
   knows only that some file imported from `dist/bundle.js`, never *which* symbol it took, and
   therefore cannot tell which of the ten listed sources supplied it. Taking the first path in
   the map is a guess, and branching to all ten manufactures a boundary's worth of false
   coupling. One source gives a file-level edge.

   **More than one source does not mean unresolved.** A bundled sibling collapses its whole
   module tree into one chunk, so its map lists every constituent file, and a rule that stopped
   there would mark *every* import of *every* bundled package unresolved — a tool engineered to
   be blind to exactly the dependencies it exists to draw. But §1.5 is clear that what the views
   draw is the boundary, not the file. So: when the listed sources all fall inside **one**
   boundary, the edge resolves **to that boundary**, with no file-level attribution and a note
   that it came from a chunk. Sources spanning more than one boundary is unresolved. An empty
   list after the tracked-file filter is **not** unresolved yet: it falls through to the
   directory rewrite below, and only if that also fails is the site unresolved. Atlas loses the
   file, which it can afford, and keeps the boundary edge, which is the thing being mapped.
2. **A `rootDir`/`outDir` rewrite**, reached when there is no source map, or the map names no
   in-repository source. This handles the plain one-file-per-file compiler case.

**Filter the source map to tracked files before counting.** A real source map lists the
package's own files and then a pile of paths that are not in the repository at all: dependency
sources, runtime shims, generated helpers. If those count, "all in one boundary" is never true
and every bundled import is unresolved again by the back door. Drop every path that is not a
tracked file, then apply the rule to what remains: one file is a file-level edge, one boundary is
a boundary-level edge, two or more boundaries is unresolved, none left falls through to the
directory rewrite.

**The hard stop therefore has three outcomes, not two: a source file, a boundary with no file
attribution, or unresolved.** Anything else is a guessed edge, and silence is the correct output
when the source cannot be identified; a fan of guessed edges is worse than either.

Slice 2 carries a fixture whose `exports` point into `dist/`, and its only acceptable outcomes
are the three above: a source file, a boundary edge with no file attribution, or an unresolved
count. A fixture that admits only the first and last would let an implementer throw away the
boundary edge this rule exists to keep. **Pin the resolver exactly as the grammars are
pinned** — a later release of it is a different resolver, and an unpinned one quietly changes
what the map says.

Four rules, none of them the TypeScript compiler, none requiring a native build:

- **Relative specifier.** Tried as written, then with each source extension, then as an index
  file inside a directory of that name. Handled by the resolver above, and stated here because
  it is the failure mode that matters most. A literal path join is not sufficient: the flagship
  repositories write extensionless relative imports, so a join alone looks for a file named
  `helpers` and misses `helpers.ts`. This is the door through which the front of the fleet would
  otherwise receive the empty matrix.
- **Workspace package name.** Resolved by reading `name` fields across the workspace **and then
  through the package's `exports` map**, including wildcard subpaths. This is not optional here:
  six of the seven packages in this repository publish wildcard subpaths such as `./lib/*` and
  `./derive/*`, and the cross-package imports that the accepted dependency cycle is built on are
  precisely those subpath imports. The seventh, `report`, publishes only explicit file entries
  and no wildcard. A resolver that stops at the package root misses the subpath imports in the
  six.
- **Alias.** `paths` and `baseUrl` in `tsconfig.json` or `jsconfig.json`, fed to the resolver as
  alias configuration rather than rewritten by hand, then resolved through the rules above.
- **Python relative import.** A specifier beginning with one or more dots resolves by path
  traversal from the importing file's own directory, exactly as the relative rule above does for
  TypeScript: one dot is the file's package directory, each further dot climbs one level. This
  is tried **before** any source-root mapping. Without it, `from .models import User` is handed
  to the root mapper as `.models`, finds nothing, and every relative import in the Python third
  of the fleet is unresolved.
- **Python absolute import.** A dotted name mapped onto directories and `.py` files **from each
  identified source root**. Python does not resolve from the git root under a `src/` layout:
  `app.models` lives at `backend/src/app/models.py`, and a root-based lookup finds nothing.
  Source roots are found by probing for `pyproject.toml`, `setup.py` and `setup.cfg`, and a
  `src/` directory beneath any of them; a dotted name is tried against each root. **If the probe
  finds nothing, the git root is the source root.** An earlier draft said "never the repository
  root", which was aimed at assuming the root instead of `src/`, and would have emptied every
  unpackaged tree that is nothing but `lib/foo.py`. The TypeScript-shaped rules above do not
  cover Python at all; these two are its entire rule set.

Dynamic imports whose name is computed, and Python wildcard imports, remain counts, because
nothing static resolves them. A dynamic import that spells its module out resolves like any other
(§3).
**When unresolved sites outnumber resolved edges, the import matrix is labelled low confidence.**
An empty matrix must never read as a repository with no dependencies.

**1.8 The third profile is named Machine.** Not LLM, not AI. Those name the technology of a
particular few years, and the profile is the slice for any automated reader.

---

## 2. The boundary file

`atlas/boundaries.yaml` in the repository being mapped. Human-owned. Atlas proposes it and
reconciles against it; the human wins on names.

Per boundary:

| Field | Owner | Notes |
|---|---|---|
| `name` | human | The identity. Stable across renames of its contents. |
| `globs` | human, proposed | The extent. |
| `status` | human | `proposed` or `accepted`, or `deferred` with a reason. |
| `role` | proposed, human-confirmed | `code`, `test`, `docs`, `config`. |
| `reason` + `why_from` | human | Why this boundary exists. `why_from: derived \| human`. |
| `will_break` + `will_break_from` | human | The consequence sentence. Same two sources. |
| `start_here` | derived, human may pin | Entry point. |
| `rebaseline` | human | A commit hash requesting this boundary's cohesion high-water mark be reset. Applied by **`atlas map`**, never by the weekly job, **before** the drop rule in the local run that first sees it, then written into the snapshot as honoured so it cannot re-fire. An idempotency key, never a tree to check out. See §5. |

Repository-level, not per boundary: the co-change `window` (default 180 days, or a start commit
after a restructuring), the threshold overrides, `machine_budget` (default 2500), and `summary`.
The Machine profile is **one file for the whole repository**, so its cap is one number beside the
window. Seven boundaries must not become seven budgets.

`summary` is one human-written sentence saying what this repository is. It is optional; when it
is missing, Orientation's first paragraph reads "unnamed: what this repository is" and the rest
of the page still works. It exists because the design spec needs a first paragraph and the
boundary reasons cannot be stitched into one: seven reasons written at different times are not a
paragraph, and a mechanical join is derived prose wearing a human voice. `atlas init` offers the
field empty and never derives a value for it.

**The bootstrap ladder.** `atlas init` writes every boundary as `proposed` with every authored
field marked `derived`. A repository with no `atlas/` directory **passes the check with a
notice**, so turning the tool on across a hundred repositories reddens nothing. Acceptance is a
status flip that fails while any `reason` or `will_break` is still `derived`. Derived text can
be edited into a human sentence; it cannot be rubber-stamped. A boundary explicitly `deferred`
with a reason is exempt and appears in Orientation as unnamed. `start_here` fails acceptance
only when both the pin and the derivation are empty, so a correct derived entry point is never
retyped.

**The proposal heuristic is two rules that compose, and neither is a clustering algorithm.** First, one boundary per package the repository declares: when the root manifest names workspaces, exactly those members; otherwise every manifest in the tree. Then, for whatever remains, one boundary per top-level directory that contains tracked files, one level deep. Role comes from the non-test files: a boundary is test only when every code-shaped file in it matches the test conventions, so a package with a large colocated suite stays code. Nothing clusters. The benchmark finding that every architecture-recovery algorithm
leaves significant gaps is therefore a caution on this proposal step, not a requirement for a
second algorithm. A competing clusterer would fight the human for the pen; the divergence report
in §5 is how the evidence argues instead.

---

## 3. What is derived, and what is committed

Everything Atlas produces is exactly one of two kinds. Authored text lives only in the boundary
file.

**Structural.** Deterministic given a commit and a boundary file.

- Boundary membership, names, status, role, glob extent
- Files belonging to no boundary
- Resolved import edges between boundaries
- Unresolved import site counts per boundary
- Entry points
- Any diagram made only of these facts, such as an import-edge matrix

**Statistical.** A function of a time window, and legitimately different at every commit.

- Churn, co-change pairs, coupling strengths, hotspot ranking
- The three-way breakage table
- Any diagram built on them, such as a churn treemap

A diagram that mixes the two says so in its caption.

**The file walk is `git ls-files`, not a directory listing.** The unassigned gate compares path
sets, so walking the working tree would enrol `node_modules`, a virtual environment and build
output as unowned files, and the next install would add members and hold the gate red on a
perfectly healthy repository. Tracked files only. A force-added dependency directory then shows
up as a genuine unassigned set that a human can see and decide about, which is what the gate is
for.

**Unresolved imports are structural and equality-checked.** A dynamic or wildcard import that
lexical parsing cannot follow becomes a count on the boundary. It is not an edge and it is not
silence. Every view shows the count. A map that says nothing about what it could not see is the
confidently wrong map this design exists to avoid.

**Both kinds are committed into the repository being mapped**, under `atlas/`. Files under atlas/ are excluded from the artifact and from every count in it. The artifact cannot record a stable hash of itself, and a count that includes it changes on the commit that lands it. Statistical
sections carry the date they were computed. The drift research is the whole reason for
committing rather than serving. Architectural drift is well attested: implementations diverge
from the intended architecture over time, maintaining reliable documentation is one of the
practices developers themselves name for mitigating it, and junior developers rely on
documentation more heavily than seniors, who substitute experience. That last point is the
Orientation audience precisely. A generated artifact committed alongside the code, and gated on
structural drift, is how documentation earns the reliability that mitigation depends on.

**Doors are structural too.** Every tracked workflow under `.github/workflows/` is a door, recorded
in the artifact's `doors` list, sorted by file. A door carries:

- `triggers`: one entry per event, normalized from every shape `on` takes. Path, branch, tag, type
  and workflow filters are kept, sorted; a schedule gives one entry per cron line.
- `permissions`: `scope:level`, top level and every job together. `read-all` is `all:read`.
- `secrets`: every `secrets.NAME` in the file, and `usesWorkflowToken` for the workflow's own token.
- `commands`: every `run:` step in file order, with its job and its name or index.
- `runs`: the tracked files and directories those commands execute, with the job that executes
  them, read by the conventions of the tool each command starts (below). A path is executed when
  it is the command itself or when a tool that executes files is handed it. npm scripts are read
  by the same rule, followed through nested `npm run`, pre and post hooks, a named workspace and
  `--workspaces`. A step's working directory is honored. Commands are split as the shell splits
  them: quotes hold, `$(...)` is a command of its own, and a here-document body is input, not
  commands. A run carries `directory: true` when it is a directory, `matched: true` when a tool's
  patterns selected it rather than the command naming it, and `via` when it was found through a
  file or a configuration. `runsCount` is how many distinct paths the door runs.
- `mentions`: every other tracked path in that text, such as a path an `echo` prints or a file
  handed to `git diff`. They are where the next slice looks for landing places; they never
  feed `reach`.
- `stages` (what follows `git add`, a variable spelled out from an assignment earlier in the step,
  then the step's, the job's and the workflow's `env`; one set at run time stays as written),
  `pushes`, and `sends`: `dispatchesTo`, `publishesTo` (`npm`, `pypi`, `crates.io`, `rubygems`,
  `container image`), `publishes` (true when `publishesTo` is not empty), `releases`,
  `deploysPages`, `opensIssues` with `opensIssuesOnFailure`, and `opensPullRequests`.
- `uses`: the actions its steps use, without the ref.
- `reach`: the boundaries the door reaches through the import closure of `runs`, in the order it
  reaches them. Depth 0 is the boundaries of the run files themselves; depth n is the first
  breadth-first step at which a boundary is reached; `files` is how many of its files were reached.

```json
{ "boundary": "verify", "depth": 1, "files": 10 }
```

**A door is read by the conventions of the tools it runs.** backpropagate's CI read as "runs
verify.sh" while it ran pytest over `tests/` and ruff, mypy and bandit over the package, and
ai-rpg-engine's CI reached one part while `eslint .`, `tsc --build` and `vitest run` covered
thirty-five. Only `node`, `bash` and their kin followed by a file had counted. Each tool is now
read the way it reads its own command line:

- An interpreter runs the script it is handed, past the flags that take a value: `node`, whose
  `--import`, `--loader` and `--require` values run too; `python`, and `python -m`, whose dotted
  module is the tracked `a/b.py`, `a/b/__main__.py` or `a/b/__init__.py`, under `src/` too;
  `tsx`, `ts-node`, `deno run`, `bun`, `bash`, `sh` and `source`, and the command `bash -c` is
  given. `python -m` naming a tool, `python -m pytest`, is that tool.
- A wrapper is read as the command after it: `uv run`, `uvx`, `poetry run`, `pipx run`,
  `hatch run` (not an `env:script` of the project's), `coverage run`, `npx`, `npm exec`, `env`,
  `timeout`, `sudo`, `xargs` and `nice`. `npx <bin>` runs the tracked file a manifest's `bin`
  names.
- A checker or a test runner runs the files and directories it is handed: `pytest`, `ruff`,
  `mypy` (whose `-p` is a package directory), `black`, `flake8`, `pylint` and `bandit`. A flag's
  value never passes for a path, so `bandit -c bandit.yaml` mentions the file and runs nothing.
- A tool that names no file reads its configuration, and what that selects is `matched`, with
  `via` naming the tool and the file it read. `tsc --build` follows `references` and `tsc -p`
  reads one project; an include that names a directory is the directory, a pattern is matched,
  and `include`, `exclude` and `files` inherit through a relative `extends`, relative to the
  file that wrote them. `vitest` reads `test.include` and `test.exclude`, never `coverage`'s;
  `jest` reads `testMatch`, `mocha` its `.mocharc` spec, `eslint` every script it lints less its
  `ignores`, `pytest` its `testpaths`, and `node --test` its default patterns. Without a
  configuration the tool's defaults apply.
- A command that installs, prints or inspects runs nothing it names (`pip install pytest`,
  `echo`), and neither does a container (`docker run image make`). `tox` and `cargo` run no
  tracked file. An unknown command that hands a tool its arguments, a shell function such as
  `run_stage lint ruff check src/`, runs that tool.

A shell script, a make target with its prerequisites and the makefile's variables spelled out,
and the command lines a JavaScript or TypeScript file hands `execSync`, `spawnSync` and their
kin when written out in full, are read once more as commands; what they run carries `via` naming
them. That second level reads no further file, so a chain of scripts stops after one.

A directory run is one entry, and reach stands it for the code files under it. A matched set is
written as the directories it fills: a directory whose every code file was matched stands for
them, and a matched file under a directory the same job runs is not listed again. A door records
at most 200 paths, what its commands name first, then matched directories, then matched files
one from each directory in turn, so every directory a tool ran keeps a file and the reach walked
from the list reaches every part the door runs. The limits say when a door was capped. On
ai-rpg-engine CI's `eslint .` covers what `tsc --build` and `vitest run` select, and the door
records nine runs:

```json
{
  "job": "build-and-test",
  "path": "packages/",
  "directory": true,
  "matched": true,
  "via": "eslint eslint.config.js"
}
```

The page words a door from these fields: "publishes to PyPI and a container image", "opens an
issue when it fails" when every step that opens one runs only after a failure (a condition that
can hold on a cancelled or a green run does not count), and "commits reports/baseline.txt and a
path set at run time" rather than the variable. A pull request trigger counts its paths, a
release trigger reads "when a release is published" for that type and "on a release event"
otherwise, and a push filtered by branches and tags names both. A path under a directory the door
also runs is not named again unless the commands name it and only a tool reached the directory,
what the commands name comes before what a tool matched, and a directory that spans parts says
how many.

The busiest door, the one the page follows, is the door a newcomer should read first. With tools
read properly a test suite reaches every part, so reach alone would name CI everywhere. Of the
doors that reach a part, one that commits into the repository (non-empty `stages`) comes first,
the widest of those; with none, the widest door. A door that reaches none is never the busiest,
and a schedule-only door loses a tie. When the busiest is not the widest the page says why: on
this repository "the busiest is Ingest dogfood submission, which reaches 7 parts and commits into
the repository (CI reaches 11 but commits nothing)". The rule counts a commit, not `landings`:
CI's reach holds the code that writes `indexes/` and `records/`, so it has landings of its own,
and "writes nothing" would contradict its own paragraph. On backpropagate no door both commits
and reaches a part (mutmut commits its baseline and runs nothing the map sees), so the busiest
is CI, which reaches four parts, not the weekly training smoke; on ai-rpg-engine it is CI too.
When no door reaches a part the page says so and follows none.

A workflow that does not parse is recorded as `{ file, name, parseError: true }` and the rest of the
doors are mapped. The host check does not compare doors yet; a later slice decides what their drift
means.

**Landing places are structural too.** Every file the engine reads records where it writes and
what it reads, and the map puts the two together into who writes each tracked place and who reads
it. A place is a tracked path, or a tracked directory: a directory that is a prefix of at least one
tracked path. `node_modules` and `dist` are never places.

- `writes`: the places a file's write calls name, each with the call. For JavaScript and
  TypeScript the calls are `writeFileSync`, `writeFile`, `appendFileSync`, `appendFile`,
  `mkdirSync`, `mkdir`, `createWriteStream`, `renameSync`, `rename`, `copyFileSync`, `copyFile`,
  `open` and `openSync` with a `w`, `a` or `x` flag, and a wrapper named for one of them, such as
  `atomicWriteFileSync`. For Python they are `open` with a `w`, `a` or `x` mode, `write_text`,
  `write_bytes`, `shutil.copy`, `copy2`, `copyfile` and `move`, and `os.rename`, `os.replace`,
  `os.makedirs` and `os.mkdir`. A rename or copy lands on its destination.
- `reads`: the same for `readFileSync`, `readFile`, `readdirSync`, `readdir`, `existsSync`,
  `statSync`, `createReadStream`, `open` without a write flag, Python `open` in read mode,
  `read_text`, `read_bytes`, `os.listdir`, `os.scandir`, `glob.glob`, a path's `glob` and
  `iterdir`, and `fetch` or `get` given a readable argument. A string in the file that names a
  tracked place outside any of these calls is a read with call `literal`: naming a place is how
  code hands it to a function the engine does not know. A string holding a whole
  `raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>` URL, where the path is a place, is a
  read with call `raw-url`, its ref and its owner and repository.
- `dynamicWrites` and `dynamicReads`: how many of those calls name nothing the engine could read.

An argument is read within its own file. A string literal is its text; a template or a `+` is
its pieces up to the first one the engine cannot read, which leaves the value open, a prefix; a
path join takes its segments the same way, and a first segment it cannot read, such as a
`repoRoot` parameter, is taken as the root the rest is relative to. `__dirname`,
`import.meta.dirname`, `__file__` and `Path(__file__).parent` are the file's own directory. A
name is followed to its nearest declaration and to every assignment of it in that scope, and a
call to a function declared in the same file is followed to what it returns. A value names the
place it equals, or else the deepest tracked directory it lies under, so
`records/${id}.json` names `records`.

A file the engine does not parse, HTML, YAML, Markdown, JSON or shell, is scanned as text: a
single- or double-quoted string on one line that equals a tracked path, or names a tracked
directory with a slash, and every whole raw URL. Each entry carries its confidence, `ast` for a
parsed file and `text` for a scanned one. A workflow is read as a door, not scanned.

- A door's `landings` are the places it stages, read the same way, and every place a file in
  its reach writes. Its `readers` are, for each landing, the files whose reads name it or a path
  under it, and the doors whose commands mention it.
- The artifact's top-level `landings` list every place with at least one writer or reader, with
  its `writers` (a file, or a door that stages it) and its `readers`.
- A boundary's `origin` is `generated` when a writer targets its root directory, or every one of
  its files, and none of its own files writes anything; `authored` when nothing writes inside it;
  `mixed` otherwise.

```json
{
  "target": "records",
  "writers": [
    { "by": ".github/workflows/ingest.yml" },
    { "by": "packages/ingest/persist.js" }
  ],
  "readers": [
    { "by": "packages/report/status.js", "call": "literal" }
  ]
}
```

Test files and anything under a fixture directory write into temporary copies and read fixtures
of their own. Their entries stay on the file; they are never a place's writer or reader. A text
file inside a place something writes is that writer's output, so the paths it names are its data
and not reads.

The limits are the method's. Only paths spelled out in the file are named: a path built in one
file and written in another, or passed through a wrapper the engine cannot recognise by its
name, is counted as a dynamic site or missed, and a call site is counted, never named, when its
target cannot be read at all. A path join whose root is a parameter is assumed to be relative to
the repository. A scanned file's reads are text matches, not calls, and a literal read means the
file names the place, not that it opens it. The host check does not compare landings yet.

**The order of work is structural too.** Each file a door runs, and each file those files call
into, one hop and no further, records `sequences`: every module-level function that makes at
least one cross-file call, in source order, with its calls in the order they run.

- A call counts when its callee resolves, through the file's resolved imports, to a tracked file
  or a boundary: a named, default or namespace import, a `require`, or a local name that falls
  back to one, as `const check = overrides.check || defaultCheck` does. A member call on an
  import names the member and the import's target. A member call on a parameter, or on a name
  destructured from one, names the member with no target, unless the member is a built-in or
  logger method such as `get`, `push` or `warn`. Comments and strings are never calls.
- A method called on an object of an imported class is a call into that class's file:
  `trainer = Trainer(...)` then `trainer.train()`, or `const store = new Store()` then
  `store.save()`, names the method, the class's file, and `receiver`, the class. A Python class
  is told from a function by its CapWords name. A name bound to what a function returns is not
  followed, since the methods of what it returns may be defined anywhere, a database handle from
  a package, say; a name bound to what a same-file function returns is not followed either, and
  the order continues after that function's spliced calls.
- In Python, a call through a package that hands a name on, as `backpropagate/__init__.py` does
  with `from .trainer import Trainer`, targets the file that defines the name, following such
  imports up to eight deep.
- A call inside an inline function handed to another call is a call. It is read at the
  statement that holds it, after the call it is handed to. An eager argument's calls come
  before the call they feed.
- A call to a function defined in the same file is not a step. That function's own calls are
  spliced in its place, depth first, each carrying `via`, the function it came from. A function
  is spliced at its first call only.
- A bare name handed to a call, when it is itself such an import, is recorded where it is handed
  over, with `passed: true`. It is reached; it is not known to run there.
- Of consecutive calls to one callee, the first is kept. A function stops at 24 calls and says
  `truncated: true`.

A sequence is `{ name, exported, invokedAtTopLevel, isDefaultExport, calls }`. A call is
`{ name, target, line }`, with `via`, `passed` and `receiver` when they apply; `target` is `{ file }`,
`{ boundary }` or null, and `name` is the name the target exports it under.

```json
{
  "name": "writeRecord",
  "target": { "file": "packages/ingest/persist.js" },
  "line": 502
}
```

`entry` names the function a reader starts from, and `entryRule` the rule that chose it. The
rules apply in order:

0. The function a console script names for the file: `[project.scripts]` or
   `[project.gui-scripts]` in a `pyproject.toml`, `backprop = "backpropagate.cli:main"`. The
   manifest says what runs, so nothing read from the file overrides it.
1. A module-level function the file's top-level code invokes, a guard such as `if (isMain)` or
   `if __name__ == "__main__":` included. Of several, the widest.
2. The default export.
3. An exported function named `main`, `run`, `cli`, or for the file's basename.
4. The widest exported function.

The widest is the one with the most calls after splicing, so a function that does its work
through helpers in its own file is not passed over; source order breaks a tie. On this
repository `packages/ingest/run.js` enters at `ingest` by rule 1, the widest of the functions
its `isMain` block calls, and `packages/verify/index.js` at `verify` by rule 4.

In each file a door runs, every call of the entry function whose target records a sequence under
that name carries `inner`: that function's calls, one level only, at most 12, with
`innerTruncated` past that.

The limits are the method's. A call through a name the engine cannot follow to an import, a
dynamic specifier, a method on an object whose class the engine cannot name, or a callback
stored and called later, is not a step. Class methods are not recorded as functions, so a method
call carries no `inner`, and a method a class inherits is attributed to the class's own file. A
JavaScript function re-exported from the file it is imported through gets no `inner`, since its
body is elsewhere; a Python one is followed to its file. Splicing at the first call reads
a helper called at every stage once, where it is first called. A member call on a parameter
names what is called, not who answers it. Every branch's calls are listed in source order, since
which branch runs is not known. The host check does not compare sequences.

**What changed since the last map is derived at map time.** `atlas map` reads the previous map
from the commit it runs at, `git show HEAD:atlas/structure.json` and `HEAD:atlas/statistics.json`,
never from the working copy. The working copy is what the run overwrites, so reading it would make
a second map at one commit compare against the first and say something else; HEAD does not move.
The structure at HEAD is compared with the one just derived, and the delta is the page's second
section, after "What this is", headed with the previous map's date and the commit it was made
from. A repository whose HEAD carries no map gets one line: "This is the first map."

Every item is a structural fact in a fixed sentence, never diff text, and the kinds run in order
of consequence, not of size:

1. A new import between parts that lies on a cycle in the new import graph, stated with the
   cycle from the importing part: "beta now imports tests, which closes the cycle beta → tests →
   alpha → beta." It "extends" the cycle instead when the two parts were already in one strongly
   connected group. Parts on a cycle are the defect-prone ones, so this kind is never cut.
2. Other new imports between parts.
3. Imports between parts that are gone.
4. Doors added or removed, a trigger gained, lost or changed (named down to the glob a path
   filter gained), a file a door now runs or no longer runs.
5. Places gaining a writer, then places gaining a reader. A weak entry is left out, as the page
   leaves it out.
6. A part whose origin flipped.
7. Steps gained or lost in the order of work: the entry functions of the main door's files, and
   the functions those entries call. The lists are matched by longest common subsequence, so a
   step inserted in the middle is one fact: "In packages/verify/index.js, verify gained a step,
   validate required steps, before validate policy."
8. Parts added, removed, or renamed (the same globs or the same files under a new name).
9. New files that belong to no part, found by the check's own rule and said to fail it.

The counts line closes the section: files added, removed, moved (into another part, or the same
bytes at a new path) and changed in content, and how many parts they touch. Each kind keeps three
items and the section twelve, cut after ordering so the top kinds survive; what is cut is counted
("And 3 more new imports between parts."). When no kind has an item, the section is one line:
"Nothing structural changed since 2026-09-23; 2 files changed content."

`page.json` carries the same facts as `changes`, or `{ "first": true }`:

```json
{
  "since": { "commit": "043abe5…", "generatedAt": "2026-…" },
  "items": [
    { "kind": "cycle", "sentence": "…", "subjects": ["beta"] },
    { "kind": "counts", "sentence": "…", "subjects": [] }
  ],
  "unchanged": false,
  "fileCounts": {
    "added": 1, "changed": 2, "moved": 0,
    "parts": 2, "removed": 0
  }
}
```

The limits are the method's. Only what the structure records is compared, so a change the engine
cannot see (a dynamic import, a write through a path built at run time) is not news here either.
A trigger compared field by field names its values, not their fields. The host check does not
read `changes`; it compares the committed structure, as before.

**Three views are derived from facts the map already holds.** They sit after "What tends to
change together" and before "Generated, never hand-edited", and nothing new is read from the tree
to write them: they are the imports, landings, exported names and orders of work turned to face
failure points and redundancy.

"What no test touches" names each code part that no test file imports, directly or through one
file between. A test file is one by name, the convention test runners discover by: a `.test.` or
`.spec.` marker, `test_*.py`, `*_test.py`, or a place under a directory named `test`, `tests` or
`__tests__`. Per-file imports are not in the artifact, so `atlas map` counts where the resolved
imports are still in hand, and the structure keeps the count per part as `testedBy` and the
number of test files as `testFiles`. A test file a test imports is the hop, not the part's code.
A code part made only of test material, such as a fixtures directory, is not a candidate. When
no file is a test by name the section says only "No test files were found by name.", since every
part would be listed and the list would say nothing.

"Written but never read" names each written place whose readers are empty or only its own
writers; a writer that reads back what it wrote is making the result, not using it. A weak
reader or writer is left out, as the rest of the page leaves it out. On this repository that is
`reports/`: the portfolio generator checks for it and writes into it, and nothing else reads it.

"Helpers that look duplicated" names pairs of exported functions of one name, in two different
parts, that look like one helper written twice. Where the map recorded an order of work for both,
their calls must match name for name, in order; where either has none, their files must share a
name. Each file's exported function names are carried as `exports`. The section opens by saying
what the pairs are: "These are candidates from names and call order, not a judgement." On this
repository the rule names `atomicWriteFileSync` in findings and in ingest, the pair the accepted
workspace cycle grew around. The findings copy is called by a file the ingest door runs, so its
order is recorded; the ingest copy is called only from files a step further in, so it has none,
and the rule falls back to the shared file name, `atomic-write.js`.

The first two lists keep eight items and the third five, and the rest are counted ("And 2 more
parts."). `page.json` carries each list with its closing lines, here from the doors fixture,
shortened:

```json
{
  "testFiles": 1,
  "testedBy": { "lib": 1, "tools": 0 },
  "untested": [
    { "part": "tools", "partLabel": "tools",
      "testedBy": 0 }
  ],
  "untestedNote": [],
  "unread": [
    { "place": "cache/",
      "writers": ["tools/cache.js"] }
  ],
  "unreadNote": [],
  "duplicates": [
    { "name": "normalize",
      "files": ["lib/store.js", "tools/prepare.js"],
      "parts": ["lib", "tools"],
      "partLabels": ["lib", "tools"] }
  ],
  "duplicatesLead": "These are candidates …",
  "duplicatesNote": []
}
```

The limits are the method's. A test is found by its name, so a test file named otherwise is not
one, and a test that runs a part as a child process or reads it as a file does not import it and
does not count, unless the test is named for a file of the part. One hop is the reach: a part a
test reaches only through two files between is
listed as untested. Being imported by a test says a part is loaded, not that its behaviour is
checked. A read through a path built at run time names no place, so a place read only that way
is listed as never read. The duplicates are candidates: two helpers of one name with no recorded
order and the same file name may do different work, and a helper copied under another name is
not found. The host check compares none of the three.

**Python reads as Python.** The rules above were first measured on JavaScript. Mapping
backpropagate, a Python training library, and reading its page as a newcomer found seven places
where a JavaScript-shaped reading said something untrue about a Python repository, and each is
now read the way Python itself reads it.

A bare import is looked up from the source roots: each packaging directory and its `src/`, then
the repository's `src/` and root. A local module deeper in the tree does not shadow a dependency
the project declares. `from datasets import Dataset` beside `backpropagate/datasets.py` is the
HuggingFace library, and was 40 of the 51 sites the map had called unresolved. The declared names
come from every `pyproject.toml` (`[project] dependencies`, `[project.optional-dependencies]`,
`[tool.poetry.dependencies]` and its groups) and every `requirements*.txt`, folded the way
distributions are imported, and without the project's own name, which an extra such as
`backpropagate[ui]` repeats. A site read as a declared dependency where a local module shares the
name is counted on the boundary as `externals`, with the names as `externalNames`, and the page
says how many there are apart from what could not be resolved at all. A name that is in the tree
but neither at a source root nor declared stays unresolved: a `sys.path` insert is what makes such
an import local, and nothing in the tree says whether one runs.

```json
{
  "name": "backpropagate",
  "externals": 9,
  "externalNames": ["datasets"],
  "unresolvedSites": 2
}
```

`importlib.import_module("a.b")` and `__import__("a")` with a string literal, and `import("./x")`
or `require("./x")` in JavaScript, are sites of kind `dynamic-literal` and resolve as imports.
`importlib.util.spec_from_file_location(name, path)` is one too when its path reduces to exactly
one tracked file, read the way a landing's path is read, joins and `__file__` included; that is
how backpropagate's tests load `scripts/check_doc_drift.py`, and why the scripts part is no
longer listed as untested. A computed name stays a `dynamic` site.

A console script in `[project.scripts]` or `[project.gui-scripts]` makes its module's file an
entry point of the boundary that holds it, and names that file's entry function (rule 0 above).
An entry is always inside its own boundary's globs: backpropagate's root `package.json` names
`bin/backpropagate.js`, which the top-level-files part does not contain, so that part has no
entry.

Python keeps tests in `tests/`, so a file's own test is found across directories:
`tests/test_trainer.py` is the own test of `backpropagate/trainer.py` when the name after the
test marker matches, the language matches, and the test sits beside the file or anywhere under a
directory named `test`, `tests`, `__tests__` or `spec`. The same pairing sets a file and its own
test aside from "What tends to change together", keeps the two out of the duplicates, and counts
a test for the part of the file it is named for in `testedBy`, even when its import could not be
resolved.

A tracked `.sh` or `.bash` file is read as commands, as the shell splits them. A redirection out
(`>`, `>>`), `tee`, and the last argument of `mv` or `cp` write; a redirection in (`<`), `cat`,
`source`, and any other argument that names a tracked file read, as a quoted path does in any
text file. A word holding a variable or a glob names no fixed place, and a here-document's body
is another program's text. Everything found is text confidence. backpropagate's
`scripts/prep_release.sh` rewrites `CITATION.cff` with `mv`, so the page no longer says nothing
writes to the repository root.

Each door's reach entry past depth 0 carries `enters`, the first import into that part in walk
order (files by path, each file's imports in source order), as the file imported and the file
importing it:

```json
{
  "boundary": "backpropagate",
  "depth": 1,
  "files": 18,
  "enters": {
    "file": "backpropagate/__init__.py",
    "from": "scripts/nightly_train_smoke.py"
  }
}
```

"Where to start" names that file at each depth, not the part's entry point, which it falls back
to only when no import into the part was recorded; a package index is followed to the file the
previous file's entry first calls into through it. Four sentences changed with these facts. A
pair of parts reads "the tests part imports the backpropagate part", since a part's name is often
a common word. "Written but never read" says "No place this map can see is written, so none goes
unread." when nothing strong is written, rather than claiming every written place has a reader.
The limits say how many sites name declared dependencies before how many "could not be
resolved". `atlas check` with a map on disk that HEAD does not hold says "no committed map;
nothing to check against" and exits 0, since comparing a map against itself proves nothing.

The limits are the method's. A distribution imported under a different name (PyJWT is `jwt`) is
not matched by its declared name, and falls to the ordinary lookup. A class is a CapWords name,
so a CapWords factory function is read as a class and a lowercase class is missed. A console
script whose module is not a tracked file names no entry. The shell reading takes paths from the
repository root, where release scripts that name repository files run, and does not follow `cd`;
`sed -i` and other commands that edit in place are not writes. The host check compares entry
points, so a boundary whose entry was outside its globs changes once on the map that drops it.

This repository's own handbook diagram is a
hand-drawn image whose only tests assert that it exists, is large enough, and has accessible
title and description elements. Nothing checks that it is true.

---

## 4. The host check

`atlas check` runs as one step inside the mapped repository's **existing** test job. No new
workflow file in any mapped repository; the studio caps push-triggered workflows at two per
repository after a real and expensive incident, and a tool that demanded a third would not be
adopted.

It does three things:

1. Recomputes the structural artifact at the current commit and **compares the boundary-level
   graph for equality**. What is gated is the set of boundary names with their status and role,
   the set of inter-boundary edge *pairs*, the entry points, **the unassigned set as a subset
   check**, the **unresolved-import count per boundary**, and **the boundary of every file that
   already appears in the committed roster**, **a new path whose content hash matches a
   disappeared roster path, which must remain in that path's boundary**, and **an accepted
   boundary matching zero files**. What is **not** gated is the appearance of genuinely new
   content inside a glob that already claims it, and the disappearance of a file.

   That split matters. Gating nothing about the roster left a hole: a critical file moved from
   boundary A into boundary B, where an A-to-B edge already existed, changed no edge pair and
   passed, leaving the committed map claiming the file was somewhere it no longer was. That is
   the drift the tool exists to catch. Gating the whole roster reintroduced the new-file tax. So
   the comparator is: **an existing file may not change boundary; a new file merely has to land
   in one.**

   Gating by path alone still misses the move, because a move is a disappeared path plus a new
   path, and neither is gated on its own. The committed roster names the old path, the new path
   is new content inside a claiming glob, the A-to-B edge already exists, and the check stays
   green on exactly the case the paragraph above was written for. So the same content hash the
   unassigned gate already stores is stored for rostered files too, with the same 100-byte floor:
   **a new path whose hash matches a disappeared roster path must remain in that path's
   boundary.** Genuinely new content that lands in a glob stays green, so the new-file tax stays
   gone. A move that also edits the file is a new member and needs a regenerate, the cost already
   accepted for renames. A tiny file below the floor that moves boundaries is not architectural
   drift and is allowed through.

   **An accepted boundary matching zero files fails.** A directory rename empties a boundary's
   glob at a stroke; the files that reappear elsewhere trip the unassigned gate, the developer
   creates a new boundary for them, and the old one would otherwise linger in the committed map
   forever with nothing in it. An empty accepted boundary is either a stale glob or a stale
   boundary, and either needs a human.
2. Fails if a statistical section carries **no date**.
3. **Does not fail because a date is old.**

That third rule is load-bearing. An earlier draft made the gate a recompute-and-compare over
everything, which cannot work: the co-change window ends at the generating commit, so at any
later commit the window has slid and a comparison fails on every push with nothing structurally
changed. A later draft fixed that with a replay of the statistics at a stamped commit, bound by
a structural hash, an ancestry check and a thirty-day freshness budget.

**What is struck is the checking, not the statistics.** The host check does not recompute or
compare the statistical sections. The replay, the structural-hash binding, the ancestry check
and the thirty-day failure are all dead and must not be reintroduced. The freshness failure died
because nobody owns a hundred regeneration commits a month, and the first stale red on an
unrelated pull request is where a gate like that gets deleted.

**The snapshots stay.** `atlas map` still produces the statistical sections, and §3 still commits
them under `atlas/` with their date. Deleting the committed breakage table or the committed
diagrams is not fidelity to this strike; it is the opposite, and it would gut Orientation for
anyone reading from a clone. What the host runs is structural equality plus the requirement that
a statistical section carry a date.

**Gating the boundary graph rather than the file roster is what keeps this from becoming a tax.**
An earlier draft gated every structural byte, which meant that adding one file matching an
existing glob reddened the build until someone regenerated. That is a pre-commit regeneration
charge on every new file, and a tool that levies it gets removed. Under the narrower gate, adding
a file inside a boundary that already claims it is green, and so is a second import along a
dependency that already exists.

What still fails is what should: a file that no boundary claims **and that is not already in the
committed unassigned set**, a boundary renamed or removed, a changed entry point, a **new** dependency pair between two boundaries, and a change in
the unresolved-import count. The dependency rule fires once when a dependency is created, not
once per import, and a new edge between boundaries is exactly the architectural event a human
should acknowledge rather than discover a year later. The counterproposal of gating only the
boundary file was considered and rejected: it would leave the committed edge graph unverified,
which is the drift the whole design exists to catch.

Two precisions that decide whether this gate works at all:

- **The unassigned set may shrink but never grow, and equality is the wrong test in both
  directions.** "Does any file lack a boundary" is a loophole: a repository accepted with five
  unowned files stays green when a sixth arrives, because the answer was already yes, so unowned
  code accumulates without limit under a gate advertised as catching it. But exact equality
  overcorrects and taxes the cleanup: deleting one of those five dead files changes the set and
  reddens the build, which punishes precisely the behaviour the gate wants. The test is therefore
  **subset**: the current unassigned set must be contained in the committed one. Removing a
  member is green. Any new member fails, including a swap that keeps the count identical.

  One refinement: **a new member whose content hash matches a removed member's recorded hash is
  a rename, not new.** Renaming an unowned file to mark it deprecated is housekeeping, not rot.
  An earlier draft used git rename detection against the generating commit, and that does not
  survive the environment the check runs in: the host job's checkout is typically a depth-one
  clone, the anchor commit is not present, git reports a delete and an add, and the build goes
  red for a rename. The check cannot assume history it does not control. So the structural
  artifact records a content hash per unassigned file, the check hashes the working tree, and
  an exact-content match across a removed and an added path is a rename with no history
  consulted. **The match counts only above a minimum size, 100 bytes by default.** Identical
  files share identical hashes, and a repository is full of legitimately identical tiny files:
  empty `__init__.py`, `.gitkeep`, a bare license header. Without the floor, deleting one
  unowned empty package marker and creating an unrelated one elsewhere reads as a rename, and
  unowned boilerplate multiplies and migrates under a gate that claims to stop it. Below the
  floor, a new path is simply a new member. A rename with edits in the same commit is likewise a
  new member and requires a regenerate, which is the honest cost. A count-based test (current count at most the committed count) was
  proposed for the same case and rejected: it reopens the swap hole, where deleting one unowned
  file and adding a different one passes on an unchanged count.

  This leaves one narrow hole, named rather than patched: a deleted path lingers in the committed
  set, so a *new* unowned file created later at that exact path passes. Restoring exact equality
  would close it and bring back the cleanup tax on every dead-code deletion, which is a common and
  desirable act traded against a rare and low-harm one. The residue goes to the **divergence
  report**, which recomputes centrally and can see that a committed unassigned entry no longer
  exists. That is the standing division of labour: the gate stops new problems entering, the
  report notices old ones accumulating.
- **The unresolved-import count is gated, and this resolves a contradiction between §3 and §4 in
  an earlier draft.** §3 called those counts structural and equality-checked while §4 exempted
  them; §3 is correct and §4 has been brought into line. Adding a file inside an existing glob
  does not move the count, so this is not the tax that was removed — the count moves when a
  static import stops resolving. Left ungated, the map would keep saying it saw everything while
  its blind spots quietly grew.

---

## 5. The central render and the divergence report

Statistics are computed when a view is rendered. One weekly job in this repository renders the
public fleet. `atlas map` in a working copy computes the same view in memory for someone who
wants it now.

**The fleet is `mcp-tool-shop-org`, not this repository's own organization.** Measured at the
time of writing: `mcp-tool-shop-org` holds 102 repositories, of which 85 are public and
unarchived, 14 are private and 3 are archived. `dogfood-lab`, where Atlas itself lives, holds 6.
A render job pointed at its own organization would draw five maps and miss the fleet entirely.

**The privacy boundary is that the job cannot see private repositories at all.** This repository
is public and Actions logs on a public repository are public, so a job that could enumerate
private names would leak one eventually, whatever it committed. The job therefore lists the
organization **unauthenticated, with `type=public`**, which returns only public repositories;
verified against the live endpoint, that listing returns zero private rows. There is nothing to
filter out because nothing private is ever returned. As defence in depth the job drops anything
whose visibility is not exactly `public`, and drops archived repositories, **before its first
log line**. The public digest carries no private name and no private count.

**Discovery is dynamic; the human file lists exceptions, not members.** An earlier draft made
the input a hand-maintained allowlist of every repository to render. That reproduced the exact
bottleneck §1.1 avoided by having the publish workflow enumerate packages at runtime, and across
roughly a hundred repositories a manual ledger is forgotten the first time someone provisions a
new one, after which the new repository silently never appears. Instead: every public unarchived
repository is rendered by default, and `indexes/atlas/exclude.txt` names the few that must not
be. New public repositories appear with no curator. The open seat shrinks from remembering every
repository to naming an exception, and the file can stay empty until an exception exists.

**A rebaseline is requested from the mapped repository, not by editing central state.** An
earlier draft kept the high-water mark in the job's own memory on the render branch and left no
way to reset it except by hand. That would mean cloning this repository, checking out a branch
the job overwrites, editing a JSON file to adjust a number belonging to someone else's
repository, and pushing. Nobody does that to quiet a warning, and a divergence report nobody can
clear is a divergence report everyone learns to ignore — which is the documented way this whole
category of tool dies.

So the request lives where every other human decision lives: a `rebaseline` field on the boundary
in that repository's own `boundaries.yaml`, carrying the commit it was requested at. That commit
is an **idempotency key, not a tree to check out**.

**`atlas map` is the command that applies it, because it is the only command that can write the
mark.** The mark lives in the committed snapshot and the weekly job may not write that snapshot.
A job that reset the mark in memory, skipped the alarm once and remembered the key would read the
old mark from the default branch on its next run and file the alarm again: the clear would last
exactly one render. So when `atlas map` sees a rebaseline key that the snapshot does not yet
record, it sets the mark to the cohesion it just measured, **writes that key into the snapshot**,
and only then runs the drop rule. The human commits that snapshot. **Order matters**: drop rule
first and the very run that honours the request re-files the alarm, and the human concludes the
field is broken.

The weekly job never applies a rebaseline. It reads the mark and the honoured key from the
committed snapshot. **The test is inequality**, because "newer" is not a relation on commit
hashes and the job cannot order two of them by looking at the strings. If the key in
`boundaries.yaml` is not the key recorded in the snapshot, it reports that **a rebaseline is
waiting on a committed `atlas map`**, and does not pretend to have cleared anything. Equality
means honoured, including when the field is left in the file forever.

This also closes a failure that the earlier central-memory design carried: with the honoured key
in the snapshot rather than in job state, losing the render branch loses nothing that could
re-fire an old request. The field in `boundaries.yaml` becomes inert the moment the snapshot
records the same key, and it can stay there indefinitely.

**The high-water mark itself lives in the committed snapshot, not in central state.** An earlier
draft hoarded it on the render branch, which meant a local `atlas map` had no baseline and could
not tell a developer they had just caused a drop; the tool would only say so through an issue on
another repository, days later. The mark is part of the dated statistical snapshot in `atlas/`,
read by the central job from the default branch alongside the boundary file and the exclusions.
Central state keeps only what is genuinely the job's own memory: the last rendered commit per
repository. Honoured rebaseline keys live in the snapshot beside the mark they reset.

One consequence, stated rather than hidden: the mark ratchets only when someone commits a render,
so a repository whose cohesion improves and is never re-rendered keeps an older, lower mark. That
makes the drop rule **less** sensitive rather than more, which is the safe direction for a rule
whose output is an alarm.

**The exclude file is read from the default branch; only state is written to the branch.**
`indexes/atlas/state.json` belongs on `atlas-render` because it is the job's own memory. The
exclude file is a human decision and must not ride the branch the job pushes, or a later push
can drop an exception the job was supposed to honour. Read the exclusions from the default
branch at the start of the run; write state back to the branch at the end.

**Both organizations are listed, under the same unauthenticated rule.** The fleet organization
is the bulk of it, and the organization Atlas itself lives in adds five more public maps. Listing
only the home organization would miss the fleet; listing only the fleet would leave this
repository off the central page, and this repository is the one whose hand-drawn handbook diagram
the design cites as the disease.

**A private repository is its own destination.** It holds its own `atlas/` directory, produced
by `atlas map` inside it or by a workflow that lives in it. There is no private aggregator,
because an aggregator would put the operational-health repository's contents in a second place.
Until someone is standing inside a private repository, it has no central page, and the public
site does not mention that it exists.

**This leaves private repositories with no automatic refresh, and that asymmetry is stated
rather than hidden.** The central render cannot see them by construction, and the host check
deliberately never fails on an old date, so nothing forces a private repository's statistics
forward. Its committed numbers are exactly as fresh as the last time a human ran `atlas map`
there, which on a quiet repository may be never again.

Two remedies were considered and one is taken. A staleness gate for private repositories only is
rejected: it is the struck freshness failure wearing a narrower hat, and it fails an unrelated
pull request for a reason the author cannot act on without cloning history and running a tool.
What is offered instead is an **opt-in scheduled workflow, shipped as a template**, that a
private repository may install to refresh its own statistics. The fleet-wide cost that this
design exists to avoid was a workflow in 85 repositories; a workflow in the handful of private
repositories that want one is a bounded, voluntary cost.

**The template is held to the same branch rule as the public job, and therefore does not close
the hole.** A private repository is still an organization repository, so the conditions are
identical: weekly or slower, `ubuntu-latest`, an explicit timeout, a concurrency group,
`workflow_dispatch`, and a branch plus an issue rather than a pull request this organization
cannot open. The refreshed statistics land on a branch in that repository. **A person merges
them**, and until they do, a clone of the default branch is exactly as stale as this section
already admits. The template prepares the commit; it does not make it.

A private repository that installs nothing keeps a map whose structural half is gated and always
true, and whose statistical half carries its age above itself. That is a worse outcome than the
public fleet gets. It is the honest one available, and a reader is told which half is which.

**The divergence report** is what the regeneration produces beyond numbers. It is the reflexion
comparison: the evidence telling the human where their declared map disagrees with what the
repository actually does. It is **advisory, never a gate** — equality on coupling would red the
build during ordinary development.

Four rules, defined numerically so that "materially" cannot become noise:

| Rule | Fires when |
|---|---|
| Boundary leaks | Coupling strength pointing outside the boundary exceeds the strength inside it |
| Two may be one | Strength between two boundaries exceeds the internal strength of the smaller |
| File has moved | A file's strongest partner, among pairs passing the strength floor, sits in another boundary |
| Cohesion dropped | The inside-over-total ratio falls 0.20 or more below the **high-water mark** (which ratchets up on its own, never down), and both snapshots were measured on the strong floor |

A floor change emits low confidence and does **not** emit a drop. All four are labelled low
confidence while the repository is on the fallen floor. The first render has no previous digest,
so the drop rule cannot fire until the second.

**The baseline is a high-water mark: it ratchets up on its own and comes down only by hand.**
Two drafts got this wrong in opposite directions and both were blind.

Comparing each render against the digest the previous render wrote never fires at all. A boundary
losing five points a week has its mark rewritten weekly, the delta is never more than five, and
it can bleed half its internal strength over a quarter in silence.

A mark that never moves on its own is blind the other way. A boundary measured at 0.80, improved
by a refactor to 0.95, then decayed to 0.76 sits only four points under its original mark, so the
rule stays quiet while a fifth of everything the refactor gained is gone.

So: **the baseline ratchets upward whenever the current value exceeds it, and the rule fires when
the current value is 0.20 or more below that high-water mark.** It moves downward only when a
human runs an explicit rebaseline. **Closing the GitHub issue is not that act** — the row stays
open, and the next render files it again, until someone rebaselines deliberately.

**The mark does not move, and the rule does not fire, while the fallen floor is in effect.**
Cohesion measured at three shared commits is a different instrument from cohesion measured at
ten, and letting the weaker reading raise or lower the mark means that when the strong floor
returns the rule compares two instruments and reports the difference between them as
architectural decay. So a quiet stretch freezes the mark where it stood, fires nothing, and
carries the low-confidence label it already earns. Comparison resumes when the strong floor is
back, against the last mark computed on that floor.

**It gets its own schema envelope** in the schemas package, on the roadmap-artifact pattern —
resolved with a local validator, not registered as a payload schema. It must **not** reuse the
dogfood finding schema, which requires a lesson identity, a closed issue-kind list, and source
records from a dogfood run. A cohesion drop has none of those, and manufacturing them would put
a false lesson into the evidence store. Each row takes a stable identity from the repository,
the rule and the boundaries involved, so a standing disagreement updates and a cleared one
closes.

---

## 6. Thresholds

| Parameter | Upstream default | Atlas | Reason for any departure |
|---|---|---|---|
| Window | question-dependent | 180 days, configurable | The source names roughly six months for an active codebase, years for a maintenance view, and says to start from full history when unsure. Full history is how an old reorganization becomes permanent architecture, so this is a deliberate departure and the boundary file may override it, including a start commit after a restructuring. |
| Changeset cutoff | 50 files | 50 files, or a quarter of in-scope files, whichever is smaller | The fraction covers small repositories where 50 never fires and one reformat would couple everything to everything. |
| Shared commits | 10 | 10, falling to 3 on thin history **or when fewer than 20 source files reach 10 revisions** | Compute at 10. Fall to 3 when the window holds fewer than 30 qualifying commits, **or when fewer than 20 source files have 10 revisions in the window**, never because few pairs survived. The upstream documentation sanctions lowering thresholds on an empty result, and a repository that can afford 10 keeps the stronger signal. A **qualifying commit** is one that remains after merge commits are dropped and the changeset cutoff is applied — the same commits that feed coupling, so the 30 is counted one way only. The 30 and the 20 are chosen defaults, not sourced ones. |
| Coupling strength | 50% | 50% | Unchanged. |
| Minimum revisions per file | 10 | 5 | Without a floor, two files created together and touched three times each register as permanent architecture on one afternoon's work. Files under the floor are omitted, not drawn as weak edges. A hot repository may raise it to 10. |

**A decoupled repository is not a repository with no data, and the trigger must not confuse
them.** An earlier draft fell to the weaker floor whenever fewer than three pairs survived. That
punishes the outcome everyone wants: a repository with 500 commits in the window and almost no
co-change is *well decoupled*, and that is a high-confidence finding. Dropping the floor there
would scrape up noise, brand a healthy repository low confidence, and freeze its high-water mark
for no reason. The fallback therefore keys on how much history exists, not on how much coupling
was found. Plenty of commits and few pairs is reported at full confidence, as few couplings.

The population is source files, and the floor has a second trigger. Cohesion and the divergence rules consider only pairs of source files; manifests, lockfiles, changelogs and readmes still appear in the pairs list but are release choreography, not architecture, and the first real artifact showed them to be the whole signal at the strong floor. The floor also falls to 3 when fewer than 20 source files reach 10 revisions in the window: a pair cannot share ten commits when almost no file has ten, so the strong floor is unreachable by construction. That is distinct from few pairs surviving, which stays a high-confidence finding of decoupling.

**On thin history the label means few observations, not probable error.** A repository that is
practically finished and sees twenty qualifying commits in six months, in which two files change
together three times, has shown a pair sharing a large fraction of everything that happened; that
is signal, and the changeset cutoffs have already removed the formatter sweeps that would make it
noise. The low-confidence label on the fallen floor therefore warns about the denominator and not
the finding: these couplings are real and rest on a small sample. A proposal to replace the label
with a further ratio threshold was declined, since the per-pair strength filter is already the
ratio that matters and a fourth unsourced knob would not improve on it.

Merge commits are dropped. Rename detection stays on, so a rename inherits history inside the
window. A commit dropped from coupling still counts toward churn: churn and coupling are
separate inputs.

Widening the window to a year to compensate for a high floor was considered and rejected. It
trades a noise problem for a worse one, freezing old reorganizations into the map permanently.

---

## 7. The three profiles

One derivation, three genuinely different texts. Not one text at three reading levels: the
expertise-reversal finding is that scaffolding which helps a novice measurably hurts an expert,
so trimming adjectives is not a profile.

**Dev.** Dense. Owners, line links, the import matrix, the hotspot treemap beside a sortable
table, unresolved counts, assumed vocabulary. Shows the statistical date and keeps the picture.

**Machine.** The slice for any automated reader. Coarse then fine, ranked, budget-bounded, with
the generating commit in the first lines and the unresolved count and any low-confidence label
visible. Budget is `machine_budget`, **one repository-level number** rather than one per
boundary, default 2500 tokens, a field so that a longer context later raises the cap without
changing the shape. Ranked rather than dumped because mid-context facts
get missed; coarse-to-fine because that is sufficient scaffolding for localization; the map is
structured input, but nothing forces the reader's own reasoning into a schema.

**The Machine file states a rule. It never issues a command.** An earlier draft had it tell the
reader to recompute past 28 days. That is a dead end: an agent reading an instruction to run
`atlas map` will attempt it, and unless its host happens to have the CLI installed, the full
history cloned and the authority to run it, it will hallucinate an execution, loop on tool-call
errors, or ignore the warning and act on the stale numbers anyway. Never give an automated
reader a conditional command it has no tooling to satisfy.

Omitting the block at render time does not work either, because the file is written while the
numbers are fresh and then sits unchanged. On day 40 the committed bytes are still the day-zero
render; there is no render step running to omit anything.

So the first lines carry the date and one rule, with no tool to invoke: **if that date is more
than 28 days ago, treat every number in the statistics file as withdrawn, and a withdrawn number
is not evidence that files are uncoupled.** The second clause matters as much as the first;
without it a reader treats a withdrawn coupling table as an empty one.

**The rule is addressed to whatever loads the files, not to the model reading them.** A model
cannot decline to read tokens already in its window, and many agent harnesses ingest every
markdown file they find at startup, which would put the withdrawn numbers back in front of it
whatever the prose said. So the instruction is written for the loader — do not load or embed the
statistics file when this stamp is more than 28 days old — and the same withdrawal is repeated in
the **first lines of the statistics file itself**, so that a harness which ingests it anyway
delivers the warning ahead of the numbers rather than after them.

**The statistical block lives in a second file, `atlas/machine-stats.txt`, which the main file
references and never inlines, and it is deliberately plain text.** A prose instruction to ignore
numbers that are sitting in the same context window is a weak guarantee: the tokens are read
whatever the instruction says. Nor does a prose instruction reach a loader, because loaders are
scripts, not models; a harness that globs every markdown file collects the statistics before any
model has read a word of the rule. So the file takes a non-markdown extension, which keeps it out
of the most common dumb ingestion pattern at zero cost.

**Plain text, not a structured-data extension.** An earlier draft used `.yaml`, which trades an
ingestion problem for a crash: a harness that sees a data extension runs the file through a
parser, and a parser meeting unquoted English prose throws and halts the agent. Formatting the
withdrawal as a comment does not help, because a parser strips comments on the way in and the
numbers reach the model with the warning deleted. A file with a structured-data extension cannot
safely carry a prose instruction. `.txt` is passed into the window exactly as written. **The limit is stated plainly:** a
harness that ingests every file regardless of extension gets the withdrawal in the first lines
and the numbers after it, and no arrangement of static files can do better than that. The
structural fix is that the stale numbers are not in the window at all unless a reader
deliberately opens a second file, and the rule above tells it not to. This costs one file and
replaces an instruction with an arrangement. The structural slice, which does not age, stays in
the main file and is always valid.

**The two files are bound by a content hash, not by a matching date.** `atlas/machine.md` carries
the stamp *and a hash of the statistics file's content*, and the host check recomputes that hash
**over the committed bytes of `atlas/machine-stats.txt`** and compares it to the value stamped in
the committed `atlas/machine.md`. It reads two files from the tree. It regenerates nothing,
consults no git history and slides no window, so it is not the statistical gate §4 struck coming
back under another name: a tree nobody has edited passes on any day, and the only way to fail it
is to change one file without the other.
Matching dates alone were a weak version of this: they prove only that two strings are equal, so
a statistics file edited without touching its date passes, and anyone editing both dates to dodge
a loader's 28-day block passes too. The hash catches the first case outright and makes the second
require deliberate effort rather than a one-line edit.

It still does not prove the numbers are fresh, and nothing committed to a file can. Freshness is
what the date claims and what the render job supplies; the hash only stops the pair being edited
apart, so the rule in one file cannot point at numbers the other no longer contains.

**It never writes the agent instruction file.** Not `CLAUDE.md`, not `AGENTS.md`, not any vendor
file. Those tell an agent how to behave; this tells it what exists, how confident the scan is,
and which commit produced the text. It lives beside them as `atlas/machine.md`. A human may add
one hand-written pointer; Atlas does not insert that line, and after acceptance a missing
pointer is a notice rather than a failure.

**Orientation.** For someone who has never opened this repository. Named for the need, not for a
skill deficit, which is why it is not called anything implying simplification. It answers three
questions:

- **Where to start** — derived from package bins and exports, plus `index`, `main`, `cli` and
  `__main__` at a boundary root. Human may pin.
- **Why it was built this way** — the authored `reason`, protected from rubber-stamping.
- **What you will break** — two derived facts and one authored sentence, kept apart.

The breakage facts are a three-way split, which replaces fan-in as the derived fact. Fan-in
alone overstates: a stable data model imported by everything breaks nothing.

| Relationship | Meaning |
|---|---|
| Imports **and** co-changes | Likely breakage. Name it. |
| Imports, never co-changes | Stable dependent. Stay quiet. |
| Co-changes, no import | Hidden coupling — what the import graph misses. |

With no usable history the table collapses to fan-in and renders as low confidence, and the same
label applies on the fallen floor so a thin sample cannot read as an alarm. The authored
`will_break` sentence sits beside the table and is the consequence the facts cannot state; the
counts stay in the derived fields, so the prose is not rewritten every time an edge appears.

**Orientation stays in the clone, complete.** A newcomer who opens the repository gets all three
answers. For a public repository the central page is the newer copy and the committed page names
that in one line. A private repository has no central page to point at, and the committed page
says nothing about one.

**The age is the first line of the statistical section, not a caption under it.** The committed
table will go stale, and the two obvious remedies are both unavailable. A 90-day host failure is
the struck 30-day failure with a longer fuse, and the first stale red on an unrelated pull
request is still where it gets deleted. An automated pull request into each repository is
unavailable because Actions in this organization cannot open pull requests and that setting
stays off, and a weekly statistics pull request across 85 repositories is the regeneration tax
moved into review.

What Orientation can do is refuse to let a reader meet a number before they meet its age. Past
28 days, the same threshold the Machine profile uses, that first line says the numbers are
historical, and for a public repository it names the central page as the newer copy. Where to
start, why the boundary exists, and the authored `will_break` sentence do not carry an age,
because they are structural or human. The breakage table is the part that goes stale, and it has
to say so above itself.

---

## 8. Visual formats

Chosen on comprehension evidence, not on how they demo.

| Format | Use | Kind |
|---|---|---|
| Text-based diagram committed beside the code | Default. The only format that structurally resists drift. | Depends on content |
| Adjacency matrix | Once a view passes about 20 nodes. Matrices beat node-link diagrams above that size for everything except tracing one path. | Structural |
| Treemap, always beside a sortable table | Where the risk mass sits. Area is read poorly, so it never carries exact values alone. | Statistical |
| Node-link, scoped to one traced path | A single call chain. Never the whole system. | Structural |

Avoided: the full-system node-link hairball, always-on animation, and flow diagrams used where
no quantity is conserved. Each demos well and misleads in use.

**Every node carries an action, an owner, or a failing check.** A review of 346 software
visualization papers found most tools go unused because they show structure without indicating
what to do. This is the single most likely way for Atlas to fail.

---

## 9. The weekly render job

The sixth workflow in this repository. `CLAUDE.md` requires explicit justification for it, and
this is the justification: **it replaces a workflow in every mapped repository.** A push in this
repository cannot see that a public consumer's coupling has moved, which is precisely the
cross-repo drift case the studio's automation rule permits a schedule for. It does not count
against the two-file push-trigger cap, because it cannot fire on a push.

Shape, per that rule:

- `ubuntu-latest`, explicit `timeout-minutes: 60`, with a per-repository budget inside the script
- `concurrency: atlas-render`, `cancel-in-progress: false`
- `workflow_dispatch` present, running the identical path
- Weekly

**It pushes a branch, never the default branch.** The ingest workflow pushes the default branch
because a lost submission breaks the evidence chain; Atlas is advisory and that precedent does
not transfer. The job pushes `atlas-render`, and **only when the divergence set changes** opens
an issue with a compare link. It never edits a workflow file.

This studio has already hit the GitHub setting that forbids Actions from creating pull requests.
**Do not flip that org setting to make this job convenient.** The branch-plus-issue shape is the
one already earned elsewhere in the studio and it is the shape to use.

**It lists unauthenticated and clones unauthenticated.** An earlier draft had the clone
authenticate with the workflow's own `GITHUB_TOKEN` to dodge rate limiting. That is wrong twice
over and is withdrawn.

GitHub documents that token's permissions as limited to the repository containing the workflow,
and documents the remedy for reaching further as creating an App installation token or a personal
token. So the credential that would actually raise the limit across another organization is a
credential wide enough to read that organization — and a credential wide enough to read it is one
configuration mistake away from reading its private repositories, in a job whose log is public.
That is the decisive argument and it does not depend on the second one.

The second argument, stated with its uncertainty: it is reported that an authenticated request
for a repository the token has no grant on returns not-found even when that repository is public,
which would make the authenticated clone fail where an anonymous one succeeds. **This could not
be confirmed in GitHub's own documentation and is recorded here as unverified.** The documented
posture is scope restriction; whether public data falls back to readable for an out-of-scope
authenticated caller is not stated either way.

Throttling of anonymous cloning is real, confirmed by GitHub's own 2025 changelog covering
anonymous HTTPS clones, but **no per-hour figure is published for git operations** — the widely
quoted 60-per-hour number is the REST limit and is not the clone limit. It is soft and
address-based. The per-repository budget already in this job is therefore where backoff belongs,
and a credential is a later change, taken only if throttling proves binding in practice and only
in a form demonstrated to receive nothing private.

Clones are bounded by date, not by depth and not by blob filter: `--shallow-since` at the
window's start keeps every commit the analysis can see, with the blobs that line counts and
rename detection need, and cuts the graph exactly where the window already does. A blobless
clone was tried first and faulted in every deferred blob during the history walk, taking
seventy times longer than the map itself.

**State lives on that branch** at `indexes/atlas/state.json`, and holds only what is genuinely
the job's own memory: the last rendered commit per repository, and per-repository parse failures.
Since slice 5 the high-water mark lives in each repository's committed snapshot. State holds the last rendered commit, the failures, and nothing else. It
is on the branch rather than the default branch precisely because it is job state and cannot wait
on a merge. Each run reads it, skips any repository whose commit has not moved, and writes it
back. An idle repository costs a ref check; a repository that has actually changed is the one
that spends the clone.

A public repository that has moved and has not been rendered in fourteen days shows that age as
a notice on the central page. It never fails a host build.

**A parse failure is per repository, never fleet-wide.** When a grammar throws on one
repository, the job records that failure against it in `indexes/atlas/state.json`, emits no map
for it, and **continues through the rest of the fleet**. The failure is recorded rather than
skipped silently, and the central page shows it. Halting the whole run on the first bad parse
would leave every other public repository unrendered, which is a worse outcome than one
repository with an honest failure against its name.

---

## 10. Compensators

No skip is permitted for an irreversible action.

| Action | Undo | Post-rollback state | Owner |
|---|---|---|---|
| `npm publish @dogfood-lab/atlas` | None for this package alone. Versions are lockstep, so the undo is a **patch bump and republish of every publishable package**, not of Atlas by itself. | The bad version stays installable forever; consumers on a range move to the patch, consumers pinned to it do not. Every other package carries a version bump it did not need. | **open seat (§12)** |
| `git push origin atlas-render` | `git push --delete origin atlas-render`, then re-run the job | Branch absent. What is lost is the skip list and the parse-failure record, so the next run clones every public repository once instead of only the moved ones. **The high-water marks and honoured rebaseline keys are not lost**: they live in each repository's committed snapshot, and the drop rule fires normally from them on the next render. | **open seat (§12)** |
| `gh issue create` for a divergence change | Close with a comment naming the run that opened it | Issue closed, not deleted; the record stays | **open seat (§12)** |
| `atlas map` writing into a host working tree | Restore **the generated files only**: `atlas/structure.json`, `atlas/statistics.json`, `atlas/orientation.md`, `atlas/dev.md`, `atlas/machine.md`, `atlas/machine-stats.txt` | Generated files reverted; uncommitted edits to `boundaries.yaml` untouched | Whoever ran it |

The last row is narrow on purpose. `git checkout -- atlas/` is **not** the undo: the boundary
file lives in that directory and is the human's pen, so a directory-wide revert would discard
their unsaved names and reasons along with the generated output. Enumerate the generated paths: `atlas/structure.json`, `atlas/statistics.json`, `atlas/orientation.md`, `atlas/dev.md`, `atlas/machine.md`, and `atlas/machine-stats.txt`.

`atlas init` needs no compensator row: it never overwrites a boundary file whose status is
`accepted`, and on a `proposed` file the whole point is that it may be regenerated.

Three of the four owners are unfilled seats. That is recorded here rather than papered over with
a role name nobody holds, and it is why NAMED_COMPENSATORS above cannot read higher than a 1.

---

## 11. Build order

Commit per slice. Each slice lands with its tests.

1. Core: the file walk as `git ls-files` (never a directory listing), boundary resolution, glob extent, unassigned files. **Both core tests.** No parsing.
2. Import extraction: four vendored grammars, hash-checked; **all four resolution rules of §1.7a**, including extension and index probing, the `exports` map, aliases and Python dotted names; unresolved counts; the low-confidence label. Structural artifact complete. The resolution rules belong here and not in a later slice, or slices 1 through 4 ship exactly the empty matrix that §1.7a forbids.
3. `atlas check`: the gated set by name — boundary names, status, role, inter-boundary edge pairs, entry points, the unassigned set as a subset check, the unresolved-import count, the Machine content hash, the boundary of every rostered file with hash-matched moves held to their original boundary, and zero-file accepted boundaries — with genuinely new content inside a claiming glob and plain disappearances ungated; plus the dated-statistics rule and the no-directory notice.
4. `atlas init`: the one-rule proposal, the status ladder, the anti-rubber-stamp gates.
5. Git layer: churn, co-change, the five thresholds, the adaptive floor. Determinism fixture (PIN_PER_STEP remediation).
6. The three-way breakage table.
7. Renders: matrix, treemap plus table, text diagrams, the three profiles.
8. Divergence: the schema envelope, the four rules, stable row identity.
9. The weekly job: public discovery across both organizations, the exclude file read from the default branch, unauthenticated date-bounded clones with per-repository backoff, state, branch, issue, per-repository parse-failure halt (ANDON remediation). Ships with the opt-in refresh template for private repositories.

Slices 1–4 are shippable alone: a repository can carry a checked structural map with no
statistics at all.

---

## 12. Open items

- **Who names an exception** in `indexes/atlas/exclude.txt`. Discovery is dynamic, so this seat
  no longer has to remember every repository and the file may stay empty; someone still owns it
  the day a public repository must not be rendered.
- **Three compensator seats are open**: who republishes the lockstep patch after a bad publish,
  who deletes and re-runs a bad render branch, and who closes a divergence issue.
- **Every standards remediation owner is unassigned.** The slices are named; the people are not.
  A remediation with a slice number and no owner is half a remediation.
- **Python import recovery** may prove too thin under lexical parsing; the Pyright escalation is
  named but unevaluated.
- **Private repositories have no automatic refresh**, by construction. The opt-in template is the
  only remedy offered and nobody has yet installed one.

---

## 13. Sources

**This list is not uniformly verified, and the earlier claim that it was has been struck.**
Primary sources were fetched for a minority of it: the CodeScene project-configuration and
temporal-coupling pages, the tree-sitter packaging and WebAssembly grammar situation, the three
abstracts named immediately below, and, read locally in this repository, the release workflow's
runtime package enumeration and the studio automation rule. **Everything else below is cited
from secondary search results and should be treated as a pointer to check, not as a checked
claim.** A source is kept only where the sentence beside it matches what that source actually
measured.

Three citations were corrected after fetching the primary text, and the corrections are recorded
rather than quietly applied:

- **arXiv:1901.07700**, Link, Behnam, Moazeni & Boehm, "The Value of Software Architecture
  Recovery for Maintenance," 2019. It is a case study running PKG, ACDC and ARC over versions of
  Android and Apache Hadoop, asking about the viability of individual methods, the quality of
  their results, and whether those results can indicate and measure architectural change. An
  earlier draft of this document claimed it found code-only recovery useful only when paired
  with reasoning about why the structure looks that way. **The abstract says no such thing** and
  that sentence is deleted. On the author's name: the arXiv byline itself prints "Pooyan
  Behnam," while arXiv's own disambiguation resolves that author to the DBLP identity "Pooyan
  Behnamghader." Cited as printed.
- **Anthony, Berntsson, Santilli & Wohlrab, "We're Drifting Apart: Architectural Drift from the
  Developers' Perspective," ICSA 2024.** Eleven interviews and sixty-three survey responses. It
  found that juniors rely more on documentation while seniors take an experience-related
  approach, and it identified mitigation practices including clear responsibilities, agreed
  best practices, and maintaining reliable documentation. An earlier draft claimed it found
  developers stop trusting stale diagrams and fall back on tribal knowledge. **It does not say
  that**, and §3 has been rewritten to the narrower finding, which supports the design anyway.
  The second author is Berntsson, not Berntsson Svensson, who is a different researcher.
- **Murphy, Notkin & Sullivan, "Software Reflexion Models: Bridging the Gap Between Source and
  High-Level Models," Proceedings of the Third ACM SIGSOFT Symposium on the Foundations of
  Software Engineering, 1995, pages 18–28.** Title and venue confirmed exactly against the
  first author's own publication page.

Findings from a third model in the same consult were dropped entirely: two arXiv identifiers
were chronologically impossible for the years attached, one link pointed at a different paper
than the one cited, and one article was about clone detection rather than the coupling
statistics it was cited for. The reasoning that survived on its own merits is present above
without attribution.

**Risk and history.** Hassan, "Predicting Faults Using the Complexity of Code Changes," ICSE
2009 — change entropy outpredicts static complexity for faults. Tornhill, *Your Code as a Crime
Scene* / CodeScene — hotspots concentrate defects; change coupling reveals architecture static
tools cannot see. CodeScene temporal-coupling documentation — the 50-file changeset cutoff, the
10-shared-commit and 50-percent-strength defaults, the 10-revision floor, and the explicit
guidance to lower thresholds on an empty result. CodeScene project-configuration documentation —
window choice is a function of the question.

**Recovery and reflexion.** Garcia, Ivkovic & Medvidovic, "A Comparative Analysis of Software
Architecture Recovery Techniques," ASE 2013 — six algorithms against known-correct answers, all
with significant gaps. Murphy, Notkin & Sullivan, "Software Reflexion Models," FSE 1995 — value
came from reconciling the human's model against extracted facts. Link, Behnam, Moazeni & Boehm,
arXiv:1901.07700 — a case study of three recovery tools over Android and Hadoop, asking whether
recovery results can indicate and measure architectural change; corrected above. Kuhn, Erni,
Loretan & Nierstrasz, "Software Cartography," JSME 2010 — stabilize layout across versions.

**Redundancy and single points of failure.** Roy & Cordy, "A Survey on Software Clone Detection
Research," Queen's TR 2007-541 — no single technique catches all clone types. Avelino, Passos,
Hora & Valente, arXiv:1604.06766 — automated truck factor; 1–2 is common even in widely used
projects. *Neither is in version one; both are named for the slice that adds them.*

**Visualization.** Merino, Ghafari & Nierstrasz, VISSOFT 2016 — 346 papers, adoption fails on
actionability. Ghoniem, Fekete & Castagliola, InfoVis 2004 — matrices beat node-link above
roughly 20 nodes except for path tracing. Shneiderman, ACM TOG 1992, with Kong, Heer & Agrawala
2010 — treemaps show mass, compare sizes poorly. Wettel, Lanza & Robbes, ICSE 2011 — a novel
metaphor can win, when validated that rigorously. Anthony, Berntsson, Santilli & Wohlrab, ICSA
2024 — drift is common; juniors lean on documentation where seniors lean on experience;
reliable documentation is a named mitigation. Moody, "The
Physics of Notations," 2009 — notation principles. Tversky, Morrison & Betrancourt, IJHCS 2002 —
animation rarely beats a good static diagram.

**Audience.** Dagenais et al., ICSE 2010 — newcomers need experimentation and validated
progress, not front-loaded prose. Begel & Simon, ICER 2008 — competent new hires struggle with
conventions, not syntax. Steinmacher et al., CSCW 2015 — stale documentation is a top dropout
cause. Kalyuga, Ayres, Chandler & Sweller, 2003 — the expertise reversal effect. Procida,
Diátaxis — structure documentation by need, not by audience skill. Nielsen — progressive
disclosure over one underlying model.

**Machine readers.** Gauthier, aider repo-map, 2023 — tree-sitter symbol graph ranked by
PageRank under a token budget. Xia, Deng, Dunn & Zhang, Agentless, arXiv:2407.01489 —
coarse-to-fine localization is sufficient scaffolding. Yang et al., SWE-agent, arXiv:2405.15793
— purpose-built interfaces beat raw access. Ouyang et al., RepoGraph, arXiv:2410.14684 —
targeted subgraph retrieval beats handing over the whole graph. Liu et al., arXiv:2307.03172 —
"Lost in the Middle." Tam et al., arXiv:2408.02442 — forced schema-constrained generation
degrades reasoning, so structure the input and not the reader's reasoning.

**Explicitly unverified, and used only as convention rather than evidence:** the `llms.txt` and
`AGENTS.md` conventions have no published controlled comparison; the claim that text-native
diagram formats resist drift is practitioner consensus rather than a trial; no canonical paper
was found measuring the effect of a stale auto-generated repository map on a coding agent, which
is why §7's 28-day rule is stated as a design choice and not as a finding.
