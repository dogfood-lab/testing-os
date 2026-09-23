---
title: Atlas
description: One page per repository that says how it works, derived from the repository alone.
sidebar:
  order: 1.5
---

![An isometric blueprint on a dark drafting sheet: a door on the left where work enters, conveyors and rollers carrying it through a machine, and shelves of boxes on the right where it is kept.](/testing-os/atlas/hero.webp)

Atlas reads a repository and writes a page that says how it works: what comes in, what runs, where it lands, who reads it, what breaks what, what changed since the last map, and where to start reading. No sentence on that page is written by a person. It is derived from the workflows, the manifests, the imports, the writes and reads in the code, the tools the workflows run, and the git history, and it is regenerated whenever the repository changes.

The page is for anyone who has to understand a repository they did not write: a new contributor, a reviewer, an operator, or a model.

This repository's own page is [`atlas/README.md`](https://github.com/dogfood-lab/testing-os/blob/main/atlas/README.md). The site renders every mapped public repository at [`/atlas/`](../../atlas/): the page, a flow picture of its busiest door, a bar picture of what breaks what (production importers as a solid bar, test-only importers continuing it dashed, the doors on the path as a numeral), a strip of the weekly renders since the first, and the one line a person may write, with a link that opens the boundary file on the repository's default branch. The specification the page is measured against is `docs/atlas-page.spec.md`, a page written by hand for this repository and approved before the generator existed. The engine was then run on a Python repository and a TypeScript repository it had never seen, and every sentence that misled a newcomer there was fixed at the class, with a test that fails against the previous engine.

## What a page says

| Section | Where it comes from |
|---------|---------------------|
| What this is | The count of parts and the language most of them are in, the count of doors and the busiest one: the one that commits into the repository and reaches the most parts, else the one with the greatest reach; the page states the rule when it applies. Then what the repository publishes to, the commands people run and the package they import, read from its manifests. |
| What changed since the last map | The structure just derived compared with the one committed at HEAD: new imports between parts (a new edge on a dependency cycle first), doors added or changed, places gaining writers or readers, origin flips, steps gained or lost, parts added, removed or renamed, then file counts. |
| What comes in | Every workflow: what triggers it, what its steps run and what they only check (linters, type-checkers), read by the conventions of the tools they name (`npm run`, `pytest`, `uv run`, `python -m`, `tsc --build`, `vitest`, `eslint`, shell scripts, Makefile targets, spawned commands). Then every command a manifest installs (a `bin` in `package.json`, a `[project.scripts]` entry in `pyproject.toml`) and the entry of a published package, each a door of its own. A tracked file handed to a tool the map has no rule for is a checked run, a `cd` moves the rest of the step, and a job gated to one event or branch keeps what it deploys or commits to that event ("deploys the site on a push to main"). |
| What happens through the busiest door | The parts its executed files are in, the parts reached through imports in order, the order of work inside the entry functions, the places it writes (a written-out file name lands on that file, not its directory; a path built from the directory the command is run in or from the home directory is not a place here; a write into a file the repository does not track is counted, never placed; a write skipped in CI, or behind a flag every run passes, is not credited to the door), what it commits and pushes, here or into a clone of another repository, and what it dispatches, publishes or deploys. What a door only checks reaches parts but writes nothing. |
| Who reads the results | The files and workflows that read those places: code that reads or imports them and the site build that renders them; readers found by scanning text are marked and never counted as structure; a Markdown link and a packaging list are not readers. |
| The other doors | The same facts for each remaining door, workflows and installed commands, in prose. |
| What breaks what | Parts by production import fan-in, with test-only importers counted separately, and by how many doors pass through them; places whose readers a hand edit would reach (a file its writer only stamps is never one). |
| What tends to change together | The strongest source-file pairs from the history, with the relation between their parts stated; a file and its own test set aside and counted. |
| What no test touches | Code parts no test file imports, directly or through one hop, including tests that spawn scripts. |
| Written but never read | Places whose only readers are their own writers, named by file. |
| Helpers that look duplicated | Candidates from names and call order; the same name across three or more parts reads as a shared contract. |
| Generated, never hand-edited | Places with a writer in code or in a workflow; a tracked file its writer reads first is said to have a block written by it and stays mixed; an untracked output is not a place. |
| Hand-authored | Parts nothing in the repository writes to, with the count of run-time-path writes that may land there. |
| Where to start | A chain of files that run, from the door a pull request goes through when the busiest door fires only on a push or a schedule, to the first reader of its output; every step names a file, manifests and data files are skipped, and the chain ends in code. When nothing can be followed it says so. |
| What this map cannot see | Unresolved imports, imports of paths outside the repository, declared dependencies that share a name with a local module, files the parser cannot read (counted by part, with the construct that stopped it), paths built at run time, writes to the directory the command is run in or the home directory, writes to files the repository does not track, commands built at run time (with how many of them are in tests), text-scanned readers, and the confidence of the history statistics. |

## Adopt it in a repository

```bash
npx --yes @dogfood-lab/atlas init
npx --yes @dogfood-lab/atlas map
```

`init` proposes `atlas/boundaries.yaml`: the named parts of the repository and the globs that own them. Correct the names and globs if the proposal is wrong; the one line a person may add is `summary`. `map` writes `atlas/README.md`, `atlas/page.json`, `atlas/structure.json` and `atlas/statistics.json`. Commit the folder. `map --divergence <file>` also writes the divergence report; a caller mapping a copy it made itself passes `--name owner/repo` when the clone carries no origin and `--baseline <dir>` holding the last committed map when the copy has none; `init --force` rewrites a boundary file from a fresh proposal.

Then run the check in the test job:

```bash
npx --yes @dogfood-lab/atlas check
```

It fails when a part gains or loses a dependency, a file changes part, a new file belongs to no part, a named part matches nothing, or a file belongs to two parts. When it fails after a change you meant to make, run `atlas map` and commit the regenerated `atlas/` files with the change; never edit the page by hand, and never change the code to satisfy the map. A repository with no `atlas/` folder is a notice and exit 0, so adopting Atlas reddens nothing. The codes it prints are listed on the [error codes](../error-codes/#atlas-codes) page.

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

## Run it for a private fleet

For repositories that must not leave your machine, the same engine ships as a container with persistent memory, `ghcr.io/dogfood-lab/atlas`, whose default command is `atlas-fleet`. It maps the repositories you list in `fleet.yml`, by mounted path or clone URL, once at start and then on a schedule, keeps every render and its history on a volume, and serves the same fleet list and per-repository pages as this site on a port of your choosing. Nothing leaves it except git fetches of the repositories you listed. The same image runs the CLI on a single mounted repository, with the CLI's exit codes passed through, so it can stand in for `npx` in a job that has no Node.

```bash
mkdir -p atlas-data repos
cp docker/fleet.example.yml atlas-data/fleet.yml
docker compose -f docker/compose.example.yml up -d
```

`atlas-data` is the memory; deleting it is the only way to forget.

## What it reads

- **Doors.** Every workflow under `.github/workflows/`: triggers, the files its steps run and the files they only check (eslint, ruff, mypy, black, flake8, pylint, bandit, tsc) by the conventions of the tools they name, what it stages and pushes, here or in a clone of another repository it made in the step, what it dispatches, publishes (npm, PyPI, crates.io, RubyGems, a container image), releases or deploys, and the issues or pull requests it opens. Every command the root or a workspace manifest installs (`bin` in `package.json`, `[project.scripts]` in `pyproject.toml`) and the entry of a published package, as doors of their own; the file each names is an entry point of its part. A tracked file handed to a tool with no rule is a checked run; a `cd` moves the rest of the step; `astro build` runs the site's config and `src/`; a job gated by an `if` on the event or ref keeps its sends and stages to that event.
- **Parts and imports.** JavaScript, TypeScript, TSX and Python, parsed with tree-sitter; imports resolved with the rules the runtime uses, including workspace package exports without `node_modules`, tsconfig chains from tracked files only, Python source roots and declared dependencies, and dynamic imports with literal names. Resolution does not depend on what is installed. A drive-letter, absolute or `~` path is external on every host and never read from disk, so the same commit maps the same everywhere.
- **Landing places and readers.** The tracked paths that code writes to and reads from, found in call expressions and followed through joins and helpers; raw GitHub URLs and quoted paths in files it does not parse, marked as found by text; shell scripts' redirections and moves. A bare filename written through a variable root, or an open prefix, is recorded weak and never makes a place look generated. A written-out path that names a file lands on that file, not its directory, and the places a door writes inside one part are named by the deepest directory they share. A path built from the directory the command is run in (`process.cwd()`, a relative path resolved at run time, `dir || "."`) or from the home directory is counted outside; a write into a file the repository does not track is counted, never placed; a tracked file whose writers read it first has a block written by them; a write guarded against CI, or behind a flag every run of a door passes, is not credited to that door; Python `Path` joins are followed. Markdown links and packaging lists are not readers; an import of a written module and an Astro site's content directories are.
- **The order of work.** For the files a door runs and the files they call into, the cross-file calls of each entry function in order, with calls inside inline callbacks counted where they sit, same-file calls spliced in place, and constructed objects' method calls named with their class.
- **History.** Files that change together over the last 180 days. The shared-commit floor falls to 3 when fewer than 20 source files reach 10 revisions and rises back to 10 only at 25, starting from the floor the previous map used, so a repository near the line does not flip between maps; the window line states the rule and the confidence is stated on the page.

## What it cannot see

Paths built at run time are counted, not named. Imports that do not resolve are counted, and a declared dependency that shares a name with a local module is said to be the dependency. Commands whose arguments are built at run time are not followed, and the page says how many of them are in tests. A file the vendored grammar cannot parse is counted by part, with the construct that stopped it. Imports of paths outside the repository, writes to files it does not track, and writes to the directory the command is run in or the home directory are counted and listed. Type-only imports count as imports.

## The map as a gate

This repository runs `atlas check` in its own CI and in `npm run verify`, and the pull-request comment on every change. The check found two things in its first days, a test that loaded a module through a computed dynamic import and a resolver that depended on whether a site's `node_modules` was installed, and both were fixed at the class, with fixtures that fail against the previous code.
