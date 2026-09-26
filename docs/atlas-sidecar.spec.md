# Atlas: the sidecar specification

**Status:** approved by the Director 2026-09-26. Companion to `docs/atlas-page.spec.md`, which still defines the page. This document defines how agents and people query Atlas. The research grounding (31 findings, cross-family verified) is `docs/atlas-sidecar.dispatch.md`; findings are cited below by author and year.

**The rule.** Atlas is an instrument with a name, not a character. People and agents "ask Atlas"; Atlas answers only with facts it derived from the repository, and every fact says how it was known and how fresh it is. No language model sits inside Atlas or between Atlas and the one asking. The agent that asks does the reasoning, and Atlas supplies the evidence. (Zheng et al. 2024: a persona does not improve accuracy. Cohn et al. 2024: a humanlike voice raises the accuracy people ascribe to the same information. Kong et al. 2025: role-play shifts the facts a model asserts.)

## Three surfaces, in build order

1. **The sidecar.** `atlas mcp` in `@dogfood-lab/atlas`: a stdio MCP server that an agent's host starts for a session and stops with it. It answers "what is true of the checkout I am working in".
2. **The front door.** A plain index for agents, published with the weekly render and linked from the site. It answers "what the published fleet looks like as of the last render". It is a projection, never the authority for a checkout.
3. **The repo-knowledge connector.** Later, and built in repo-knowledge, not in Atlas: repo-knowledge reads each repository's map as its own kind of fact beside the testing findings it already holds.

## The sidecar

### The questions

Six tools, ordered by how often the evidence says the question is asked. Reachability first (LaToza & Myers 2010: questions of this kind were asked more than 9 times a day, and half the bugs in a lab study were tied to them). Then focus points and direct relations (Sillito et al. 2008).

| Tool | Answers | From |
|---|---|---|
| `atlas_reach` | What a change to these files reaches: the files and parts that import them (production and tests apart), the doors that run them or pass through their part, the readers of what they write. What tends to change with them is listed apart, as history. | `structure.json` edges, doors, landings; `statistics.json` |
| `atlas_explain` | What one file, directory or part is: its part and role, the doors that run it, what it imports and what imports it, what it writes and who reads that, who writes it (for a place), the order of work inside it, what it changes with. | `atlas explain --json`, which covers files and directories today. It gains part names, and for a place its writers and readers: asked about `records/`, it does not yet say that ingest writes it |
| `atlas_overview` | What this repository is, what comes in (every door, its trigger, what it runs and what it sends), the main flow, and where to start reading. | `page.json` |
| `atlas_check_change` | For files an agent changed: the tests that reach them, the doors that pass through them, and what the change did to the structure (new imports between parts, a new file in no part, a new writer). It also says whether the map must be regenerated before commit. | A scoped re-read of only the changed files against the committed map |
| `atlas_changes` | What changed structurally since a commit. | `atlas diff --base` |
| `atlas_refresh` | Re-maps the checkout with this engine into a cache outside the repository, in the background, and reports progress. Later answers say which map they used. | `mapRepository` |

The first five answer from the committed map at once (about a second, as `explain` does today). A full map takes 1 min 43 s and a full check 1 min 10 s on this repository (measured 2026-09-26), so nothing interactive waits on one. `atlas_check_change` re-reads only the changed files; target under 5 s for 20 changed files here.

**What `atlas_check_change` can settle.** It recomputes what the changed files import, write and read, and updates who imports what from that. It cannot settle a change to a manifest, a workflow, a configuration file, the boundaries file, or a deleted or renamed file; for those it says a full refresh is needed and does not guess.

**What `atlas_reach` follows.** It follows `parsed` and `declared` edges as far as they go. It lists `text`, `weak` and `history` facts one step out and never follows them. It lists `unresolved` and `outside` entries where the walk stops, so the asker sees where the map ends.

**Validation.** Before answering, the sidecar checks that the map files parse, carry a format it knows, and name a commit in this checkout's history. Otherwise it halts with the reason, in Atlas's error shape (code, one sentence, what changed, what to do).

### Every answer carries

1. **Provenance, in one line and as fields:** the engine answering (its version), the map (commit, date, and the engine version that made it), and the checkout (HEAD, and, per file in the answer, whether it changed after the map, committed or not). Plain form: `Atlas 1.23.0 · map 0871aa3, 2026-09-26, made by Atlas 1.22.0 · packages/verify/index.js changed after the map (uncommitted)`.
2. **A basis on every fact.** Every fact says how it was known, and classes are never merged in one list:

| Basis | Meaning | Engine source today |
|---|---|---|
| `parsed` | Read from the code's syntax: an import, a call, a literal path. | `confidence: ast`, import edges |
| `declared` | Stated by a manifest, workflow or configuration file. | doors, runs, `confidence: config` |
| `text` | A path or URL found by text in a file Atlas does not parse. | `confidence: text` |
| `weak` | A guess the engine already marks weak, such as a bare file name. | `confidence: weak` |
| `history` | Tends to change together; statistical, with its window and confidence. | `statistics.json` |
| `unresolved` | Known to exist but not followed: an unresolved import and its reason, a path built at run time, syntax the parser cannot read. | limits, per-file counts |
| `outside` | Leaves the repository, with a `where`: `caller`, `home`, `temporary`, `untracked`, `another-repository` or `http`, since each carries a different risk. | limits, `elsewhere`, untracked landings |

3. **What Atlas cannot see, for this question.** The `unresolved` and `outside` entries that touch the asked path, not only the repository-wide count. A reader must never mistake the edge of the map for the edge of the system. (Kim et al. 2024: a plain statement of uncertainty cut acceptance of wrong answers. Kim et al. 2025: sources cut reliance on wrong answers, while explanations raised reliance on right and wrong alike.)

### Voice

Atlas's own sentences, in the page's voice: third person, the instrument named, no opinion, no advice. `Atlas: packages/verify/index.js is reached from Ingest through packages/ingest/run.js.` never `I think this module...`. Uncertainty is stated plainly: `Atlas cannot see the 3 paths this file builds at run time.` The JSON carries the same facts as fields.

### Size

Every answer is capped: 8 KB of JSON by default, and up to 64 KB when the asker passes `full: true`. Lists come most important first: production before tests, doors before files. A list that is cut says so, with `complete: false` and the count, because a model tends to treat a cut list as the whole. A tool also accepts a narrowing filter (a part, a kind), and a cursor fetches the rest. `structure.json` is never returned whole. (Yang et al. 2024: interface design changed agent performance. Liu et al. 2023: information in the middle of a long input is used worst. Gloaguen et al. 2026: pasted repository overviews did not help and cost over 20% more.)

### Safety

- **Read-only.** No tool writes the repository. `atlas_refresh` writes only to a cache outside it. The fleet test's "the checkout is as it was" assertion runs against every tool.
- **No network.** No model inside. It never listens on a port: stdio only. (Padilla 2026: of 414 internet-facing MCP servers dynamically audited, 91.8% lacked OAuth authentication.)
- **Commands.** It runs only git read commands (`rev-parse`, `status`, `diff --name-only`) and the engine.
- **Repository text is data.** Strings taken from the repository are returned as length-capped data fields. Tool names and descriptions are static and never carry repository text. (Hou et al. 2025; Radosevich & Halloran 2025.)

### Freshness: the newest engine, the newest map

- The map records the engine version that made it: a new `engine` field in `page.json` and `structure.json`. Today it records the commit and date but not the version, while about 78 adopters pin eight versions.
- When the map was made by an older engine, or the files asked about changed after it, the answer says so and names the refresh.
- When a file in the question changed after the map, the answer adds a scoped re-read of that file: what it imports, writes and reads now, marked as re-read, beside the map's view.
- `atlas_refresh` builds a new snapshot beside the old one and swaps it in whole. Each answer uses one snapshot and names it.
- The sidecar install is pinned, not floating. The last step of every release updates it, so the newest engine is guaranteed by the release, not by fetching at run time.
- Committed maps across the fleet stay current through the weekly pin-bump job. That is a separate slice, and it needs a cross-org token: the Director's decision.
- The model on the asking side is the session's own model. Atlas has none to update.

### Adoption

- Registered once at user scope for Claude Code on this rig, on by default, and documented for Copilot in VS Code and other MCP hosts.
- A repository's context file gets one pointer line, not a summary (Gloaguen et al. 2026).
- A repository with no map: every tool says so and names `atlas init`. It never guesses.
- Swarm briefs keep calling `atlas explain --json` (slice V); the sidecar shares that code.

## The front door

- The weekly render writes `indexes/atlas/llms.txt` on the render branch: a header naming it the published fleet as rendered on its date, then one line per repository with its name, door and part counts, render date, and the raw URLs of its `README.md` and `page.json`.
- The site's Atlas page gains a static pointer to it that works without JavaScript. Today the page's HTML holds none of the map's facts, so an agent that only fetches it sees an empty shell.
- The render removes files it no longer writes. The branch still carries four retired files for testing-os from 2026-09-22.

## The repo-knowledge connector (later, in repo-knowledge)

- One way only: repo-knowledge reads each map. Atlas never reads repo-knowledge and gains no dependency.
- Atlas facts are stored as their own kind, with commit and engine version. They are never merged with learned facts (findings, patterns, doctrine), and an answer that joins the two says which side each fact came from. This keeps structure derived from the repository apart from what the studio learned about it.
- It unlocks questions such as "which findings touch this part" and "which repositories write to this kind of place".

## New data points (phase 2, for the Director to rank)

1. **Consumers outside the repository.** Which other repositories read this one's files by raw URL, depend on its packages, dispatch to it or clone it, taken from the fleet's maps. This is the largest known blind spot of a single-repository map.
2. **The nine engine corners** written down at 1.22.0.
3. **C# and PowerShell**, the last two readable repositories.

## Acceptance (the oracle)

Every test is red on the tree before the slice.

1. **Real client.** A test spawns `atlas mcp` over stdio, lists the tools, and calls each one on this repository and on fixtures. Every fact in an answer equals a fact in the committed map or in `explain --json`: the sidecar invents nothing.
2. **Basis.** A fixture holding a text-found reader, a weak writer, a run-time path, an unresolved import and an outside write shows each basis in answers. No fact lacks a basis.
3. **Freshness.** A fixture whose HEAD moved after the map yields "changed after the map", an uncommitted edit yields "uncommitted", and a map stamped by an older engine yields the older-engine line.
4. **Read-only.** The checkout is byte-for-byte as it was after every tool, `atlas_refresh` included.
5. **Size.** A part with hundreds of importers returns within the cap, with a count and a cursor.
6. **Injection.** A fixture whose file names and summary carry instruction-shaped text returns it only inside data fields, and the tool descriptions are unchanged.
7. **Speed.** `atlas_check_change` on 20 changed files of this repository is measured and reported, target under 5 s.
8. **Limits of the scoped check.** A changed manifest, workflow or boundaries file, and a deleted file that others import, each yield "full refresh needed", never a partial answer passed off as whole.
9. **Traversal.** A text-found reader appears one step out in `atlas_reach` and is not followed.
10. **Cut lists.** Every cut list carries `complete: false` and its count, most important entries first.
11. **Swap.** An answer given while `atlas_refresh` runs uses the old snapshot and names it.
12. **The existing gates:** `npm run verify`, `atlas check`, the identity scan, then a release.

## Cross-family review (2026-09-26)

**Copilot's consult,** given the options without our recommendation, chose the sidecar first and the front door second, independently. It contributed five points now in this spec:
- Provenance on every answer, including whether the checkout is dirty.
- The split between what Atlas proves and what it infers, carried as a field (the basis) rather than prose.
- Negative knowledge in every answer.
- Identity without personality.
- The front door as a projection rather than the authority.

It argued for keeping learned knowledge and derived structure apart. That became the connector's rule: one way, its own kind, never merged.

The draft went to five non-Claude seats (deepseek-v3.2, qwen3.7-plus, llama-3.3-70b, command-a-03-2025, nemotron-3-super) with one instruction: name the three most serious problems and one thing to cut.

**Taken:**
- What the scoped check can settle, and "full refresh needed" otherwise (qwen, cohere).
- Loud cut lists, importance order, a filter and a full mode (qwen, nvidia).
- Traversal rules for `atlas_reach` (qwen).
- `outside` split by destination (deepseek).
- Whole-snapshot swaps (deepseek).
- Map validation before answering (deepseek).
- A scoped re-read of changed files in the question (nvidia).
- Errors in Atlas's shape (meta).

**Overridden, with reasons:**
- **Cut the front door** (deepseek, qwen). The sidecar serves only agents on this machine. An agent elsewhere, such as the Copilot consult that could not read Atlas on 2026-09-26, has nothing but public URLs, and the site's HTML is empty without JavaScript. The door costs one generated file.
- **Make provenance optional** (cohere). The provenance line is the defence against over-trust that every source and every reviewer named. It stays on every answer, kept to one line and a small object.
- **Defer the repo-knowledge connector; defer consumers outside the repository** (meta, cohere; nvidia). Both are already after the sidecar. The Director ruled the connector in; the data points await his ranking.

## Standards compliance

- **PIN_PER_STEP 2.** The engine version and map commit ride on every answer, and the install is pinned and bumped by the release.
- **ANDON_AUTHORITY 2.** A missing, unreadable or foreign map halts the answer with a stated reason, never a guess.
- **NAMED_COMPENSATORS 2.** The sidecar is read-only, so it has no irreversible action. Its release rides `release.yml`, whose compensators are in the fleet hand-off (npm deprecate plus a patch, tag delete, release delete, image delete).
- **DECOMPOSE_BY_SECRETS 2.** The sidecar is an adapter over the engine. The only engine change is the version stamp, and the connector lives in repo-knowledge.
- **UNCERTAINTY_GATED_HUMANS 2.** Every answer says what it could not see for that question, so the asker's check is aimed where Atlas is blind.
- **EXTERNAL_VERIFIER 2.** The oracle is the deterministic committed map, not a model. The design's research grounding passed the cross-family citation gate, and the option set was rated by five non-Claude families and Copilot.
