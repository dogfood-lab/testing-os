# Atlas pin bump: `scripts/atlas-pin-bump.mjs`

This script moves a fleet repository to one Atlas version: the pin in its CI and the map made again by that engine, in one commit, as the org rule asks. It works from a local clone of each repository, one pull request per repository (`docs/atlas-production.spec.md`, Part 7).

1. **It reads the pins** from the workflow files as git stores them.
2. **It makes the change in a temporary clone,** never in the clone itself, and checks it there with the target engine.
3. **It commits on a branch and proves the result** on a clean clone of that branch. It never pushes.
4. **It hands the rest to a person,** with the reason.

## Standards compliance

Scored against the six workflow standards (`.claude/rules/workflow-standards.md` in the org workspace), 0 to 3.

- **PIN_PER_STEP: 3.** The target is one exact version, the root `package.json` version unless `--version` names another. The engine that makes the map is that version from npm, or a local build passed with `--engine`. A map that does not record the target version is refused before anything is staged (`PIN_BUMP_ENGINE_MISMATCH`), and a test proves it.
- **ANDON_AUTHORITY: 3.** Every problem stops that repository with a `person` verdict and its reason. Nothing is committed when the engine fails, the map is another version's, git has no identity, or the committed tree differs from the planned one. Nothing is offered when the proof check fails. One repository's fault does not stop the others. Each stop has a test.
- **NAMED_COMPENSATORS: 2.** The table below. The tool itself performs no irreversible action: it neither pushes nor opens a pull request.
- **DECOMPOSE_BY_SECRETS: 2.** Finding pins (`pins.mjs`), the verdict (`verdict.mjs`), git (`clone.mjs`), the engine (`engine.mjs`), the plan and the commit are separate modules. The one fleet form of a pin is in one place.
- **UNCERTAINTY_GATED_HUMANS: 2.** A person sees a repository only when the tool cannot vouch for the change. The coordinator reads every diff summary and the notices before pushing.
- **EXTERNAL_VERIFIER: n/a.** No specialized claims. The proof is the engine's own `check` on a clean clone.

| Irreversible action (by the coordinator, after the tool) | Undo | State after | Owner |
|---|---|---|---|
| `git push` of `atlas/pin-<version>` | `git push origin --delete atlas/pin-<version>` | No branch on the remote | Coordinator |
| The pull request | Close it | Closed, with its history | Coordinator |
| The merge | `git revert -m 1 <merge>` in that repository, by pull request | The old pin and the old map | Coordinator, per repository |

The unpushed branch the tool leaves is undone with `git branch -D atlas/pin-<version>` in the clone.

## Commands

Each command takes one or more clones.

```bash
node scripts/atlas-pin-bump.mjs check ../roll ../facet
node scripts/atlas-pin-bump.mjs plan ../roll
node scripts/atlas-pin-bump.mjs apply --trailer "Refs: dogfood-lab/testing-os#<n>" ../roll
```

- **`check`** lists each clone's pins (file, line, form, version, the Atlas command they run), the engine its committed map records, the steps that run `atlas check`, and a verdict:
  - `done`: every pin is the target and the map was made by it;
  - `ready`: the tool can make the change;
  - `person`: it cannot, and says why.
- **`plan`** prints the change as a unified diff and writes nothing to the clone. Under the diff it prints:
  - a summary: the pins moved, the engine before and after, the doors and parts before and after (new, gone, read differently), the `atlas/` files that change;
  - the notices `atlas check` prints on the result. The 1.24.0 door checks fire on some repositories; those notices belong in the pull request.
- **`apply`** commits the change on branch `atlas/pin-<version>` from the default branch, which stays where it was. The commit title is `Pin Atlas <version> and make the map again`. The commit uses the clone's own git identity: when git has none, the tool stops (`PIN_BUMP_NO_IDENTITY`) rather than invent one. Then it proves the change: a `git clone --no-local` of the branch into a temporary directory, and the target engine's `check` run there. It prints the `git push` and `gh pr create` commands and writes the pull request's text to `.git/atlas-pin-bump-pr.md`, notices included. Run again on a branch that already holds the change, it proves it again and changes nothing.

Options:

- `--version <x.y.z>`: the target. Default: this workspace's version. It must be an exact version.
- `--engine <path to cli.js>`: run a local build instead of `npx --yes @dogfood-lab/atlas@<version>`, for a version not yet on npm. Its map is still refused unless it records the target.
- `--trailer "Key: value"`: a trailer for the commit message; repeatable.
- `--json`: JSON output, for `check` and `plan`.

Exit codes: 0 when every clone is `done`, `ready`, or applied and proven; 1 when one needs a person; 2 on a usage error. Errors take the org's shape (code, message, hint) and carry no stack.

## What a clone must be

- **A full clone.** A map reads history (commits per file, what changes together, the floor). Made from a shallow clone it would replace those figures with what one commit says: on one fleet repository a file's commit count fell from 9 to 1. A shallow clone is a `person` (`PIN_BUMP_SHALLOW_CLONE`, with `git fetch --unshallow` as the hint).
- **Clean, including no untracked files.** `atlas map` reads only what git tracks, so an untracked file would be left out of the map (from 1.25.0 `map` names such files, but the tool refuses the clone before that).
- **On the default branch** its `origin/HEAD` names.
- **Already mapped, with an `atlas check` step.** The tool moves a map; it makes no first map and adds no step. The org rule counts both, and they are done by hand.

## What it leaves to a person

| Code | When |
|---|---|
| `PIN_BUMP_NOT_A_CLONE` | The path is not the top of a checkout, or holds no commit |
| `PIN_BUMP_SHALLOW_CLONE` | The clone is shallow |
| `PIN_BUMP_DIRTY_TREE` | `git status` lists changes or untracked files |
| `PIN_BUMP_NO_DEFAULT_BRANCH` | `origin/HEAD` is not set |
| `PIN_BUMP_NOT_DEFAULT_BRANCH` | The clone is on another branch |
| `PIN_BUMP_NO_MAP` | No `atlas/structure.json` is committed |
| `PIN_BUMP_NO_CHECK_STEP` | No workflow step runs `atlas check` |
| `PIN_BUMP_UNREADABLE_FORM` | Atlas is named in another form: an inexact version, a version in a variable, a run from a path |
| `PIN_BUMP_NEWER_PIN`, `PIN_BUMP_NEWER_MAP` | The pin or the map is newer than the target; the tool never moves a repository back |
| `PIN_BUMP_ENGINE_FAILED` | The engine's `map`, or its `check` on the new map, failed |
| `PIN_BUMP_ENGINE_MISMATCH` | The new map records another version |
| `PIN_BUMP_NO_IDENTITY` | git has no identity for the clone |
| `PIN_BUMP_BRANCH_EXISTS` | `atlas/pin-<version>` exists and does not hold the change on top of the default branch |
| `PIN_BUMP_COMMIT_FAILED`, `PIN_BUMP_COMMIT_DIFFERS` | git did not commit, or committed a tree other than the planned one (a hook or a line-ending setting) |
| `PIN_BUMP_PROOF_FAILED` | `atlas check` on a clean clone of the branch did not exit 0; the branch is left |
| `PIN_BUMP_FAILED` | Anything else, with what git or the engine said |

## The fleet at 1.24.0: the measurement

Measured on 2026-09-30 over the 79 mapped fleet repositories:

- Every pin has one form: `npx --yes @dogfood-lab/atlas@<x.y.z> check` on one workflow line, one pin per repository. No `package.json` names Atlas.
- Eight versions are in use: 1.20.0 (20 repositories), 1.17.0 (16), 1.21.0 (12), 1.14.0 (11), 1.16.0 (7), 1.15.0 (7), 1.19.0 (4), 1.22.0 (1).
- 78 maps carry no engine stamp, since stamps began at 1.23.0.
- The one repository the tool leaves to a person by design is testing-os, which runs Atlas from its own source.

On full clones the tool reads 78 repositories as `ready`.

## Limits

- Only the `npx --yes` form moves. Comments and step `name:` lines are skipped.
- `ghcr.io/dogfood-lab/atlas` image references are not pins.
- A `package.json` dependency on Atlas is not read; none exists on the fleet.
- The proof runs on this machine's Node, not the workflow's, and proves `atlas check` only. The pull request's CI is the second proof.
- `atlas check` gates the map's structure (parts, edges, doors and entries, unassigned files, moves), not its file list: a new file that adds no edge passes. A green proof means the structure holds.
- Each run stamps a new time, so `apply` plans again rather than replaying a saved plan.
- The default engine needs the network (npx).
- The tool never deletes a branch.
