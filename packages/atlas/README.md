# @dogfood-lab/atlas

<p align="center"><img src="https://raw.githubusercontent.com/dogfood-lab/testing-os/main/assets/atlas-hero.webp" width="800" alt="An isometric blueprint on a dark drafting sheet: a door on the left where work enters, conveyors and rollers carrying it through a machine, and shelves of boxes on the right where it is kept."></p>

Atlas reads a git repository and writes a page that says how it works: what comes in, what runs, where it lands, who reads it, what breaks what, and where to start reading. Nothing in the page is written by a person. It is derived from the workflows, the manifests, the imports, the writes and reads in the code, and the git history, and it is regenerated whenever the repository changes.

The page is for anyone who has to understand a repository they did not write: a new contributor, a reviewer, an operator, or a model.

## Use

```bash
npx --yes @dogfood-lab/atlas init
npx --yes @dogfood-lab/atlas map
npx --yes @dogfood-lab/atlas check
npx --yes @dogfood-lab/atlas explain <path>
```

`init` proposes `atlas/boundaries.yaml`: the named parts of the repository and the globs that own them. Edit the names and globs if the proposal is wrong. The one line a person may add is `summary`. `init` also adds `atlas/**` to an existing `.vscodeignore`, `atlas/` to an existing `.npmignore` when the manifest has no `files` list, and `atlas/` to `.prettierignore` when prettier is used, and says what it added.

`check` fails when the committed map no longer matches the tree. When that happens after a change you meant to make, run `map` and commit the regenerated `atlas/` files with the change; never edit the page by hand, and never change the code to satisfy the map.

`map` writes four files under `atlas/`:

| File | What it is |
|------|------------|
| `README.md` | The page. GitHub renders it when anyone opens the folder. |
| `page.json` | The same sections as data, for sites and tools. |
| `structure.json` | Every tracked file in its part, the import edges between parts, the doors, the landing places and their readers, and the order of calls inside the files the doors run. Byte-deterministic. |
| `statistics.json` | What changes together over the last 180 days, dated. |

`check` compares the committed map with the working tree and fails when a part gains or loses a dependency, a file changes part, a new file belongs to no part, a named part matches nothing, or a file belongs to two parts. Run it in the test job so the map moves with the code. A repository with no `atlas/` directory is a notice and exit 0, so adopting Atlas reddens nothing.

`explain` says what one file is in the system, for a person about to edit it or an agent in a coding session: its part, the door that runs it or passes through its part, what its part imports and who imports it, where it writes and who reads that, the order of work inside it, and what it changes with. It reads the committed map and never maps again, so it answers at once and names the commit it answers from. `--json` prints the same facts for a machine.

## What it reads

- **Doors.** Every workflow under `.github/workflows/`: its triggers, the files its steps run (following `npm run`, `pnpm` and `yarn` scripts through root and workspace scripts, a build output back to the entry a bundler names, else to its tsconfig source, and a helper that hands literal command text to a shell) and the files they only check (linters, type-checkers), what it stages and pushes, here or in a clone of another repository, what it dispatches, publishes (npm, PyPI, crates.io, RubyGems, a container image, the VS Code Marketplace, Open VSX, the Hugging Face Hub, a Zenodo record), releases or deploys; a `git add` is not a write, and a staged place no writer names is written by people. And every command a manifest installs (`bin` in `package.json`, `[project.scripts]` in `pyproject.toml`, `[[bin]]` and `src/main.rs` in `Cargo.toml`), a Tauri crate's bin as the desktop app people install, and `run/main_scene` in `project.godot` as the game, as doors of their own. A tracked file handed to any tool is a run (a checked one when the tool has no rule), `astro build` and `vite build` run the site, and a job gated to one event keeps its sends to that event. A container, wheel or binary build runs what it starts; a push to a branch for review is not a commit into the repository; a package entry is a published door only when a door publishes it. A package whose every exported file starts a program as it loads is its entry and not a library; a private member's bin is a command bundled into the package that names its built path. `cargo test`, `run` and `bench` execute and `build`, `check`, `clippy` and `fmt` check, with Cargo's package selection; `cargo tauri` runs the crate after its `beforeBuildCommand`; `godot --script`, GUT and gdUnit4 execute, `gdlint` and `gdformat` check, and a Godot export is a send.
- **Parts and imports.** JavaScript, TypeScript, TSX, Python, Rust and GDScript, parsed with tree-sitter; imports resolved with the same rules the runtime uses, including workspace package exports (`package.json` `workspaces` and `pnpm-workspace.yaml`) without `node_modules`, so the map is the same on a clean clone, after an install and after a build. Every file is read as git stores it (CRLF as LF unless `.gitattributes` says otherwise), and a file the grammar rejects is parsed again after a byte-preserving rewrite of the constructs it rejects. Rust imports follow the module tree as rustc builds it, `use` through `crate`, `self`, `super` and `path =` dependencies; GDScript resolves `res://` from the project root, with `preload`, `extends`, a scene's `[ext_resource]` lines, `class_name` and autoloads.
- **Landing places and readers.** The tracked paths that code writes to and reads from, found in call expressions and followed through joins and helpers; a written-out file name lands on that file, not its directory; raw GitHub URLs and quoted paths in files it does not parse, marked as found by text, never a path mentioned in Markdown prose. A path built from the directory the command is run in, the home directory, a temporary directory, a helper that returns one, an environment variable or an argument the caller passes is counted outside; a write to a file the repository does not track is counted, never placed; Markdown links and packaging lists are not readers; imports, the site build and tests are. A configuration file naming a tracked path is its reader; a bootstrap write (only when the file is absent) is nobody's; a write under the working directory that spells a tracked place lands there, so said. A write behind a main guard is credited only to a door that runs the file; a `for-of` over literal values is read element by element. Rust `fs` writes and reads are followed through `Path` joins and `CARGO_MANIFEST_DIR`; GDScript `FileAccess`, `ResourceSaver` and `DirAccess` on `res://` land here, and `user://` is the player's data directory, counted apart.
- **History.** Files that change together, with a floor that falls when the history is thin, and the confidence stated on the page.

## What it cannot see

Paths built at run time are counted, not named. Imports that do not resolve are counted with their reason, and so are imports of paths outside the repository, writes to untracked files, and writes to the directory the command is run in (unless they spell a tracked place, which is then said); a claim that nothing writes or imports is qualified by the files the parser could not read; a package script's glob is expanded as the job's shell would and the test files left out of CI are listed; links over HTTP and unrun deploy files are named, and writes to the player's data directory (`user://`) are counted apart. The page ends with the list of what the map could not see for that repository, so a reader knows the edges of the picture.

## Errors

Every failure prints one shape: the code, one sentence, what changed, what to do, and the exit code. Exit 2 means the input was unusable and nothing was checked; exit 1 means the check ran and the tree disagrees with the committed map.

```text
ATLAS_OVERLAP  A file belongs to more than one boundary.
  what changed:   shared/util.js: alpha, shared
  what to do:     narrow one boundary's globs, then atlas map
exit 1
```

## Private repositories

`templates/atlas-refresh.yml` is a workflow that maps a private repository inside its own CI and commits the page there. Nothing leaves the repository.

A whole private fleet runs as a container with persistent memory: `ghcr.io/dogfood-lab/atlas` maps the repositories listed in its `fleet.yml`, keeps every render and its history on the `/data` volume, and serves the fleet list and each page on a port. The same image runs the CLI on a repository mounted at `/repo`. Run commands live in the repository's `docker/README.md`.

## Part of testing-os

Atlas is one package of [dogfood-lab/testing-os](https://github.com/dogfood-lab/testing-os). The specification of the page, and the reasoning behind it, is `docs/atlas-page.spec.md` there. Licence: MIT.
