---
title: Atlas
description: One page per repository that says how it works, derived from the repository alone.
sidebar:
  order: 1.5
---

Atlas reads a repository and writes a page that says how it works: what comes in, what runs, where it lands, who reads it, what breaks what, and where to start reading. No sentence on that page is written by a person. It is derived from the workflows, the manifests, the imports, the writes and reads in the code, and the git history, and it is regenerated whenever the repository changes.

The page is for anyone who has to understand a repository they did not write: a new contributor, a reviewer, an operator, or a model.

This repository's own page is [`atlas/README.md`](https://github.com/dogfood-lab/testing-os/blob/main/atlas/README.md). The site renders every mapped public repository at [`/atlas/`](../../atlas/), with a flow picture of its busiest door. The specification the page is measured against is `docs/atlas-page.spec.md`, a page written by hand for this repository and approved before the generator existed.

## What a page says

| Section | Where it comes from |
|---------|---------------------|
| What this is | The count of parts and doors, and the door that reaches the most parts. An optional one-line `summary` a person may add. |
| What comes in | Every workflow: what triggers it and which tracked files its steps execute. |
| What happens through the busiest door | The parts its executed files are in, the parts reached through imports in order, the places it writes, what it commits, pushes, dispatches, publishes or deploys. |
| Who reads the results | The files and workflows that read those places, with readers found by text scanning marked as such. |
| The other doors | The same facts for each remaining workflow, in prose. |
| What breaks what | Parts by import fan-in and by how many doors pass through them; places whose readers a hand edit would reach. |
| Generated, never hand-edited | Places with a writer in code or in a workflow. |
| Hand-authored | Parts nothing in the repository writes to. |
| Where to start | A chain of files from the busiest door's workflow to the first reader of its output. |
| What this map cannot see | Unresolved imports, paths built at run time, text-scanned readers, and the confidence of the history statistics. |

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

Public repositories under `dogfood-lab` and `mcp-tool-shop-org` that have committed an `atlas/` folder are rendered weekly onto the `atlas-render` branch and appear on the site. A private repository uses the workflow template shipped in the package, `templates/atlas-refresh.yml`, and nothing leaves it.

## What it reads

- **Doors.** Every workflow under `.github/workflows/`: triggers, the files its steps execute (following `npm run` through root and workspace scripts, hooks and `--workspaces`, split the way the shell splits), what it stages and pushes, what it dispatches, publishes, releases or deploys.
- **Parts and imports.** JavaScript, TypeScript, TSX and Python, parsed with tree-sitter; imports resolved with the rules the runtime uses, including workspace package exports without `node_modules`. Resolution does not depend on what is installed.
- **Landing places and readers.** The tracked paths that code writes to and reads from, found in call expressions and followed through joins and helpers; raw GitHub URLs and quoted paths in files it does not parse, marked as found by text. A bare filename written through a variable root is recorded weak and never makes a place look generated.
- **History.** Files that change together over the last 180 days, with a floor that falls when the history is thin, and the confidence stated on the page.

## What it cannot see

Paths built at run time are counted, not named. Imports that do not resolve are counted. Facts inside a single file, such as the order of checks a verifier runs or that records form a hash chain, are not on the page yet; the hand-written specification has them and the generator does not, and that gap is the next thing to close.

## The map as a gate

This repository runs `atlas check` in its own CI and in `npm run verify`. The check found two things on its first days: a test that loaded a module through a computed dynamic import (an unresolved site the map could not follow), and a resolver that depended on whether a site's `node_modules` was installed. Both were fixed at the class, with fixtures that fail against the previous code.
