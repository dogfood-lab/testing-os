---
title: Atlas
description: One page per repository that says how it works, derived from the repository alone.
sidebar:
  order: 1.5
---

Atlas reads a repository and writes a page that says how it works: what comes in, what runs, where it lands, who reads it, what breaks what, what changed since the last map, and where to start reading. No sentence on that page is written by a person. It is derived from the workflows, the manifests, the imports, the writes and reads in the code, the tools the workflows run, and the git history, and it is regenerated whenever the repository changes.

The page is for anyone who has to understand a repository they did not write: a new contributor, a reviewer, an operator, or a model.

This repository's own page is [`atlas/README.md`](https://github.com/dogfood-lab/testing-os/blob/main/atlas/README.md). The site renders every mapped public repository at [`/atlas/`](../../atlas/), with a flow picture of its busiest door. The specification the page is measured against is `docs/atlas-page.spec.md`, a page written by hand for this repository and approved before the generator existed. The engine was then run on a Python repository and a TypeScript repository it had never seen, and every sentence that misled a newcomer there was fixed at the class, with a test that fails against the previous engine.

## What a page says

| Section | Where it comes from |
|---------|---------------------|
| What this is | The count of parts and doors, and the busiest door: the one that commits into the repository and reaches the most parts, else the one with the greatest reach; the page states the rule when it applies. |
| What changed since the last map | The structure just derived compared with the one committed at HEAD: new imports between parts (a new edge on a dependency cycle first), doors added or changed, places gaining writers or readers, origin flips, steps gained or lost, parts added, removed or renamed, then file counts. |
| What comes in | Every workflow: what triggers it, and what its steps execute, read by the conventions of the tools they run (`npm run`, `pytest`, `uv run`, `python -m`, `tsc --build`, `vitest`, `eslint`, shell scripts, Makefile targets, spawned commands). |
| What happens through the busiest door | The parts its executed files are in, the parts reached through imports in order, the order of work inside the entry functions, the places it writes, what it commits, pushes, dispatches, publishes or deploys. |
| Who reads the results | The files and workflows that read those places; readers found by scanning text are marked and never counted as structure. |
| The other doors | The same facts for each remaining workflow, in prose. |
| What breaks what | Parts by production import fan-in, with test-only importers counted separately, and by how many doors pass through them; places whose readers a hand edit would reach. |
| What tends to change together | The strongest source-file pairs from the history, with the relation between their parts stated; a file and its own test set aside and counted. |
| What no test touches | Code parts no test file imports, directly or through one hop, including tests that spawn scripts. |
| Written but never read | Places whose only readers are their own writers. |
| Helpers that look duplicated | Candidates from names and call order; the same name across three or more parts reads as a shared contract. |
| Generated, never hand-edited | Places with a writer in code or in a workflow. |
| Hand-authored | Parts nothing in the repository writes to. |
| Where to start | A chain of files from the busiest door's workflow to the first reader of its output, naming the file each step actually imports. |
| What this map cannot see | Unresolved imports, declared dependencies that share a name with a local module, paths built at run time, text-scanned readers, and the confidence of the history statistics. |

## Adopt it in a repository

```bash
npx --yes @dogfood-lab/atlas init
npx --yes @dogfood-lab/atlas map
```

`init` proposes `atlas/boundaries.yaml`: the named parts of the repository and the globs that own them. Correct the names and globs if the proposal is wrong; the one line a person may add is `summary`. `map` writes `atlas/README.md`, `atlas/page.json`, `atlas/structure.json` and `atlas/statistics.json`. Commit the folder.

Then run the check in the test job:

```bash
npx --yes @dogfood-lab/atlas check
```

It fails when a part gains or loses a dependency, a file changes part, a new file belongs to no part, a named part matches nothing, or a file belongs to two parts. A repository with no `atlas/` folder is a notice and exit 0, so adopting Atlas reddens nothing. The codes it prints are listed on the [error codes](../error-codes/#atlas-codes) page.

## Ask about one file

```bash
npx --yes @dogfood-lab/atlas explain packages/ingest/persist.js
```

`explain` says what one file is in the system, for a person about to edit it or an agent in a coding session: its part, the doors that run it or pass through its part, what it imports and what imports it, its own test, where it writes and who reads that, the order of work inside it, and what it changes with. `--json` gives the same facts as fields. It reads the committed map and never maps again, so it answers at once and names the commit it describes.

## See the delta on every pull request

```bash
npx --yes @dogfood-lab/atlas diff --base origin/main
```

`diff` compares the committed map at a base ref with a fresh map of the working tree and prints the "what changed" section as markdown or JSON, writing nothing. This repository's CI runs it on every pull request and posts the result as one comment, updated in place, so a reviewer sees "ingest now imports dogfood-swarm" or "nothing structural changed" before reading the diff. The step never fails the build; on a fork it prints to the job log and summary instead.

Public repositories under `dogfood-lab` and `mcp-tool-shop-org` that have committed an `atlas/` folder are rendered weekly onto the `atlas-render` branch and appear on the site. A private repository uses the workflow template shipped in the package, `templates/atlas-refresh.yml`, and nothing leaves it.

## What it reads

- **Doors.** Every workflow under `.github/workflows/`: triggers, the files its steps execute by the conventions of the tools they name, what it stages and pushes, what it dispatches, publishes (npm, PyPI, crates.io, RubyGems, a container image), releases or deploys, and the issues or pull requests it opens.
- **Parts and imports.** JavaScript, TypeScript, TSX and Python, parsed with tree-sitter; imports resolved with the rules the runtime uses, including workspace package exports without `node_modules`, tsconfig chains from tracked files only, Python source roots and declared dependencies, and dynamic imports with literal names. Resolution does not depend on what is installed.
- **Landing places and readers.** The tracked paths that code writes to and reads from, found in call expressions and followed through joins and helpers; raw GitHub URLs and quoted paths in files it does not parse, marked as found by text; shell scripts' redirections and moves. A bare filename written through a variable root, or an open prefix, is recorded weak and never makes a place look generated.
- **The order of work.** For the files a door runs and the files they call into, the cross-file calls of each entry function in order, with calls inside inline callbacks counted where they sit, same-file calls spliced in place, and constructed objects' method calls named with their class.
- **History.** Files that change together over the last 180 days, with a floor that falls when the history is thin, and the confidence stated on the page.

## What it cannot see

Paths built at run time are counted, not named. Imports that do not resolve are counted, and a declared dependency that shares a name with a local module is said to be the dependency. Commands whose arguments are built at run time are not followed. A file the vendored grammar cannot parse is marked. Type-only imports count as imports.

## The map as a gate

This repository runs `atlas check` in its own CI and in `npm run verify`, and the pull-request comment on every change. The check found two things in its first days, a test that loaded a module through a computed dynamic import and a resolver that depended on whether a site's `node_modules` was installed, and both were fixed at the class, with fixtures that fail against the previous code.
