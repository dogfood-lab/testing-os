# Atlas test gaps: the fleet check (2026-09-26)

Before a test-gap rule ships, it runs over every fleet repository and is held to the precision bar in `docs/atlas-test-gaps.spec.md`: a rule wrong more than once in ten, overall or for any kind of code with at least five firings, does not ship, and a rule with fewer than 20 firings ships provisional. The facts the rules rest on are held to the same bar, on a sample of each kind. This is the record of that check (acceptance item 10).

## How it was checked

- **The fleet.** All 79 repositories, mapped from their default branches with the engine as it stood, and every rule run over each map. Six rounds were run. Each wrong finding a round turned up was fixed at its class, with a fixture that failed first, and the next round was run on the fixed engine. The numbers below are round 6, the last full round, at commit `7f19dd2f`. Two commits came after it and change no finding: `f7760f94` changes which test files read as run by no workflow, checked on the three repositories it touches, and `7f7e4bf9` changes wording.
- **Suggestions.** Every one was reviewed.
  - G6: an independent search flags each finding whose file a test or a workflow spells by name. Every flagged finding (94 across the rounds) was read by hand. An unflagged finding, whose file no test or workflow mentions, is counted right.
  - G3: every finding was read by hand, with the lines of every test that mention the command or its entry.
  - G1, G2 and G4: every finding was read by hand.
- **Facts.** For each kind, 22 were drawn at random with a fixed seed, one per repository before any repository gave a second, and each was read against the repository. A kind with fewer than 22 in the whole fleet was checked in full. The draw is from round 4. Where a later fix changed a kind (the test steps whose runner Atlas cannot name, and the test files no workflow runs), the wrong facts were checked again on the fixed engine; the spelled-name facts, new in round 6, are drawn from round 6.

## The rules

| Rule | Firings | Wrong | By kind of code (5 or more firings) | Verdict |
|---|---|---|---|---|
| G6 failure paths no test reaches | 304 | 6 (2.0%) | MCP server 117 (0 wrong), Node 77 (5), Python 62 (1), Tauri 36 (0), TypeScript monorepo 11 (0) | ships |
| G4 coverage not collected | 43 | 0 | Node 20, MCP server 6, Python 5, Tauri 5: none wrong | ships |
| G3 an installed command nothing runs | 27 | 0 | Node 12, MCP server 11: none wrong | ships |
| G2 test files no workflow runs | 11 | 0 | under 20 firings | ships, provisional |
| G1 a part no runner here tests | 7 | 0 | under 20 firings | ships, provisional |

G1 was held back until runner attribution passed this check; it did (below).

**Still wrong (6, all G6):**
- ollama-intern-mcp `smoke/corpus.mjs`, `live.mjs`, `seams.mjs` and `targeted.mjs` are live smoke scripts themselves. They sit in a `smoke/` directory, and their names do not say smoke, so Atlas reads them as code.
- escape-the-valley `src/escape_the_valley/__main__.py` is run by a smoke script through the binary PyInstaller builds from it.
- vocal-synth-engine `apps/cockpit/src/main.ts` is loaded in a browser by a Playwright smoke test.

**Fixed on the way.** Round 3 held G6 wrong 36 times in 362, 23 of them in 146 MCP-server findings (16%), so G6 failed the bar for that kind. Most were facet's: its tests run each tool through conftest helpers that join a name to a directory built at run time. A test that spells a file's name in a string is now a reach Atlas cannot follow (kind `names`, basis `text`), and no rule says no test reaches such a file. That closed 30 of the 36 and both of G3's two wrong findings. Earlier rounds fixed, among others:
- `npm test --` arguments;
- Mocha specs run from a build's output;
- a Python import of a submodule by name from its package;
- a `.js` path whose TypeScript source sits beside it;
- MCP servers started over stdio;
- five spawn shapes;
- G3 counting one entry once, whatever names install it.

## The facts

| Fact | In the fleet (round 4) | Checked | Wrong | Note |
|---|---|---|---|---|
| A test run's runner (attributed) | 242 | 22 | 1 | a script's `npm test` guarded by its `--check` flag, followed regardless |
| A test step whose runner Atlas cannot name | 34 | 22 | 0 | 5 wrong before `953257c9`: steps named for tests that only grep, audit or type-check |
| Coverage collected by a run | 238 | 22 | 0 | half on, half off |
| JUnit results written by a run | 242 | 22 | 0 | half on, half off |
| A test imports the file | 4,680 | 22 | 0 | one witness imports only a type; other tests import it by value |
| A test runs the file | 262 | 22 | 1 | a test's `python -m build` read as checking the package directories |
| A runner finds tests in the file | 46 | 22 | 0 | |
| A test file no workflow runs | 210 | 22 | 0 | 2 wrong before `f7760f94`: Playwright specs a job runs over its configured directory |
| A test's string spells the file's name | 124 (round 6) | 22 | 0 | worded "spells its name", which is what Atlas knows; 3 are paths inside a repository the test builds |
| A failure-path site (G6's constructs) | 1,522 | 22 | 0 | line and enclosing function |
| A part's kind of code | 457 | 22 | 2 | a site declared as code; print assets in a desktop repository typed Tauri |
| The runners credited to a part | 291 | 22 | 0 | |
| A workflow uploads to Codecov | 16 | 16 | 0 | all of them; no repository with a Codecov step is missed |
| A test file its runner's configuration leaves out | 2 | 2 | 0 | provisional: fewer than 20 |

## Corners written down, not fixed

- A smoke script in a `smoke/` directory whose name does not say smoke is read as code (the four G6 findings above).
- A run through a built binary (PyInstaller) or a page load in a browser is not followed.
- A script's child process guarded by a mode flag is followed whatever flag the step passes.
- A wheel build inside a test reads as checking the package's directories, and a test's checks count as reach.
- A type-only import counts as an import.
- A part a repository declares as code gets a code kind, though it is a site. Every script part of a repository that ships a desktop app is typed as the Tauri app.
- The names reach silences some right findings as well: a test that reads a launcher's text or lists paths keeps G3 quiet for comfy-preflight, escape-the-valley, facet, portlight and xrpl-camp, and G1 for backprop-trace's examples. Fewer suggestions, none of them wrong.
- A workflow step with no name is named by its index in its job, counting from 0.

## Rounds

| Round | Engine | G6 | G3 | G4 | G2 | G1 |
|---|---|---|---|---|---|---|
| 1 | `48a133bc` | 414 | 79 | 43 | 16 | 8 |
| 2 | `a90c5b34` | 377 | 38 | 41 | 12 | 7 |
| 3 | `58be391b` | 362 | 34 | 41 | 10 | 7 |
| 6 | `7f19dd2f` | 304 | 27 | 43 | 11 | 7 |

Round 4 repeated round 3 on a fix that changed no finding, and round 5 was stopped for round 6. Mapping time across the fleet did not change (575 s in total, rounds 4 and 6).

## Test scripts no runner collects (2026-10-13, testing-os#158)

role-os keeps `test_*.mjs` scripts that check a tool and exit 1 when it is wrong. No runner's discovery collects that name, and no workflow ran them, so G2 named the repository's two Python test scripts and missed these two. The change marks a `test_*` file in the JavaScript and TypeScript family as a test (`scriptTest`) when it fails by itself and no file imports it, and gives G2 the command that runs such a script. A Python test that ends with a failing `sys.exit` is said to run on its own where no runner covers it. The name rule is unchanged, so no runner is said to discover these scripts.

**Pre-registered with R&D before any run.** Engine A was the head of #159 (`1c336c15`); engine B was A plus the change. Each of the 96 repositories in the fleet list was mapped by both from its default branch, with no history read, and compared on:
1. every file B marks `scriptTest`, judged test or not;
2. every G2 firing new or changed in B, judged right only if each file is a test that no workflow runs, directly or through a script;
3. every other difference in `structure.json`, in `atlas gaps` and on the page, to be explained by the new tests or counted against the change.

The bar is the one above: wrong at most once in ten, provisional under 20 firings, and each wrong finding fixed at its class with a fixture that fails first. There were fewer than five judgments of each kind, so R&D re-read every one, at the same commits and blind to the reasoning, and agreed with all four.

**Result, round 4, 96 repositories, none failed to map.**

| | Count | Wrong |
|---|---|---|
| Files marked `scriptTest` | 2 (role-os) | 0 |
| G2 firings new or changed | 2 (role-os's two scripts with `node`; ai-jam-sessions' `spaces/jam-actions-live/test_tools_local.py` with `python`) | 0 as findings; the suggestion was wrong once, fixed (round 4) |

Both ship provisional.

**Collateral, all in role-os and all from its two new tests:**
- `testFiles` went from 78 to 80;
- one part's `testedBy` went from 3 to 5;
- `testsNotRun` gained the two scripts;
- G6 stopped firing on `prep_inputs.mjs`, which one of them spawns. That is G6's meaning: reached by a test, whether or not a workflow runs that test.

No page sentence changed in any repository.

**Rounds:**
- **Round 1** wrote the evidence fact `selfFails` into the map, which put a stray fact on a testing-os fixture. Since round 2 the map carries only `scriptTest` and `selfRun`.
- **Round 3** widened the Python evidence after the recall check below found `test_tools_local.py`. It ends with `sys.exit(1 if fails else 0)` at module level, with no `__main__` guard, so a failing exit at module level now counts as well as one under a guard. A module-level exit cannot survive pytest's collection, so such a file is a script by construction. The fixture `scripts/test_flat.py` failed first.
- **Round 4** fixed the suggestion R&D's re-read found wrong. `test_tools_local.py` opens `app.py` by a relative path, so `python spaces/jam-actions-live/test_tools_local.py` from the repository root fails before it checks anything. Every self-run suggestion now names the script's own folder as the step's `working-directory`. That is safe for a script that resolves paths from its own location, as role-os's do through `import.meta.url`. The fixture `tools/test_relative.mjs` reads beside itself.

**Recall.** The fleet holds exactly two `test_*` scripts in the JavaScript and TypeScript family, and both are flagged. Of the Python test files no workflow runs, 33 stay silent:
- 25, because a test step whose runner Atlas cannot name silences G2 for its whole repository (19 of them in xrpl-camp; testing-os#162);
- 7 in ai-jam-sessions (`scripts/test_*.py`), which are pytest-style: `def test_*` with bare asserts, no import and no exit, which pytest would collect (testing-os#161);
- 1 in readouts, a benchmark that is no test.

**node --test.** A bare `node --test` already runs over Node's own default patterns (`NODE_TEST_DEFAULTS` in `core/tool-configs.js`), so it was never taken to collect a `test_*` script. What was wrong was the suggestion G2 would have given ("let its discovery collect them, or name their directory"), since neither collects that name. A marked script now gets the command that runs it. One written for a framework is to be named in its run, or added to the runner's include. A vitest `include` that names `test_*` collects the file, and G2 stays silent; the fixture pins it.

**Corners written down:**
- A Python test of bare asserts with no exit, run by no workflow, stays silent (the 7 above, testing-os#161). It needs a runner guessed, which G2 does not do.
- A Python test that exits inside a `main()` it calls at module level, with no `__main__` guard, stays silent: the exit is inside a function, and nothing guards the call. The fixture `scripts/test_main_call.py` pins it.
- A script inside a directory a runner is handed (`node --test checks/`) is counted as run, though node collects only its default names there. That errs toward no false gap.
- A TypeScript script on a package whose `engines` admit a Node that strips no types, with no tsx or ts-node declared, is given no command, only the advice to use a TypeScript runner.

The fixture is `fixtures/atlas/test-scripts`.
