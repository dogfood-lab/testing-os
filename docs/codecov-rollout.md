# Codecov rollout: `scripts/codecov-rollout.mjs`

This script moves a fleet repository's CI to Codecov recipe v2, one pull request per repository. It works from a local checkout of each repository:

1. **It reads the test steps.** A fresh Atlas map says which step runs the tests, and with which runner.
2. **It edits the files as text,** so everything it does not change keeps its comments and layout.
3. **It checks the result** against the recipe before offering it.
4. **It hands the rest to a person.** What it cannot edit safely it leaves alone, with the reason.

## Recipe v2

testing-os, attestia, comfy-headless and websketch-ir already run this recipe:

- **The test job writes coverage and JUnit test results.** One leg is the coverage leg: one matrix cell, on a pull request or a push to the default branch, marked by `COVERAGE_LEG`.
  - On that leg the job saves both reports as artifacts, with `actions/upload-artifact` pinned by commit (`if-no-files-found: error`, `retention-days: 3`, `overwrite: true`).
  - It saves test results even when the tests fail.
- **A separate `codecov` job uploads them.**
  - Its permissions are exactly `contents: read` and `id-token: write`.
  - It runs no command of its own.
  - It checks out without keeping credentials.
  - It downloads the artifacts by pattern.
  - It uploads each report with `codecov/codecov-action` v7.1.1, pinned by commit. Each upload signs in with OIDC, fails when Codecov refuses the report, runs the Codecov CLI at v11.3.1, turns search off and names its files.
- **`codecov.yml`** keeps both statuses informational, keeps the project figure out of the comment, and is in the workflow's paths filters.

The pins are in `scripts/lib/codecov/recipe.mjs`.

## Commands

Each command takes one or more checkouts.

```bash
node scripts/codecov-rollout.mjs check ../ai-jam-sessions ../motif
node scripts/codecov-rollout.mjs plan ../ai-jam-sessions
node scripts/codecov-rollout.mjs apply ../ai-jam-sessions
node scripts/codecov-rollout.mjs delivered ../ai-jam-sessions mcp-tool-shop-org/motif
```

- **`check`** lists how each repository differs from recipe v2. It exits 0 only when every repository matches.
- **`plan`** prints the change as a diff, and writes nothing. It exits 1 when a repository needs a person.
- **`apply`** makes the change and commits it on branch `ci/codecov`. Then it prints the `git push` and `gh pr create` commands, with the pull request's text saved in `.git/codecov-rollout-pr.md`. It never pushes.
  - It will not start on a checkout with uncommitted changes.
  - When a workflow pins an Atlas version, `apply` runs that version's `atlas check`, as CI does. If the change fails the check, it makes the map again and adds it to the commit.
- **`delivered`** asks Codecov's API whether the default branch has coverage. See [Confirming delivery](#confirming-delivery).

Options:
- `--step workflow:job:step` names the test step that carries the reports, for when the tool finds two.
- `--trailer "Key: value"` adds a trailer to the commit message.
- `--coverage <path>` and `--results <path>` name the reports the test step already writes on the coverage leg, from the repository's root. They go together, and each can be repeated. With them the tool leaves the step's command as it is and writes the rest of the recipe. Use them after making the runner's own configuration write both reports when `COVERAGE_LEG` is `'true'`, for a step no flag can reach. See [What it leaves to a person](#what-it-leaves-to-a-person).
- `--json` prints the result of `check` or `plan` as data.

## How it decides

1. **The test step.** Only workflows that run on pull requests or pushes count.
   - The step that already collects coverage carries the reports.
   - When no step collects coverage, the tool uses the one step that runs a runner it edits: Vitest, pytest or node --test.
   - When two steps qualify, it asks for `--step`.
2. **The leg.**
   - It uses the matrix values the step's `if:` fixes.
   - When the step names none, it uses the leg the old Codecov upload ran on.
   - Failing both, it takes the first value of each matrix axis, preferring an ubuntu runner.
3. **The reports, by runner.** A flag goes at the end of the one command that runs the runner, before any redirection or pipe. The step's `if:` is never changed.
   - **Vitest:**
     - The JUnit reporter is added. Any reporters the command or the configuration already names are kept.
     - Coverage comes from the configuration's reporters: lcov, then Istanbul JSON, then Cobertura or Clover. If none of those is configured, lcov is added.
     - If the step collected no coverage, it is turned on for the coverage leg only, when the coverage provider is already a dependency.
   - **pytest:**
     - `--junitxml` is added, and an XML coverage report beside the terminal one.
     - If the step collected no coverage, it is turned on for the coverage leg only, when pytest-cov is a dependency. It measures the configured source, or else the project's own package.
   - **node --test:**
     - JUnit is written through `NODE_OPTIONS` on the coverage leg.
     - Coverage is c8's lcov when c8 runs. If c8's reporters leave lcov out, a `c8 report` step adds it.
     - Otherwise `NODE_V8_COVERAGE` plus one `c8 report` step produce it, as in testing-os.
4. **The workflow.** The tool:
   - sets `COVERAGE_LEG` on the job;
   - gives the step an `id`;
   - adds two save steps after it;
   - removes the old Codecov steps, with the comments written just above them;
   - adds the `codecov` job right after the test job;
   - adds `codecov.yml` to each paths filter;
   - writes `codecov.yml`.
5. **The check.** The edited workflow must parse and pass `check`, or nothing is offered.

## What it leaves to a person

A plan that needs a person names each reason. Here they are, with the fix each points to:

- **The step runs the runner through a chain of scripts,** for example `npm run verify`, then `npm test`. A flag added to the step would reach the chain's last command, not the runner. Make the runner write both reports when `COVERAGE_LEG` is `'true'`, then run `apply` with `--coverage` and `--results` naming the files:
  - **Vitest:** in the configuration, read `process.env.COVERAGE_LEG === 'true'`. On that leg add the `junit` reporter with `outputFile.junit`, turn coverage on if the chain does not already, and add a coverage reporter Codecov reads (`lcovonly`, or keep `json`). claude-rpg, roll and ai-playtest are done this way.
  - **pytest in a script:** add `--cov`, an XML coverage report and `--junitxml` to the script's pytest call on that leg only. prompt-craft's `verify.py` is done this way.
  - Check the chain both ways before committing: with `COVERAGE_LEG=true` it writes both files, and without it nothing changes.
- **A script runs more than the runner** (`vitest run && node check.js`), for the same reason.
- **The tests run from a build's output without source maps.** Coverage would name built files, which Codecov cannot match to the repository. Turn on `sourceMap` in the build, and keep the maps out of a published package (`"!dist/**/*.map"` in `files`) so `npm pack --dry-run` lists the same files as before; then the tool plans the repository by itself. bytefit and loadout-os are done this way.
- **The tests are plain node scripts.** They write no test results to upload.
- **Something is missing or already there:**
  - no coverage provider, or pytest-cov, among the dependencies;
  - no package to measure;
  - a `COVERAGE_LEG` or a `codecov` job already there;
  - a `codecov.yml` that says something else;
  - a second Codecov configuration file;
  - another job or workflow that uploads to Codecov.
- **The shape is not one the tool edits:**
  - a step that runs on a condition other than a matrix value;
  - a paths filter in flow style;
  - a run text in a folded YAML style;
  - a workflow not indented two spaces at a time.

## Waves 1 and 2: the dry run

`plan` ran over every repository in waves 1 and 2 on 2026-09-26, from checkouts of their default branches. It planned 22 of the 29 repositories. None of the 22 needs its Atlas map made again: every one covers the new `codecov.yml` with a root part. The dry run picked these test steps:

| Wave | Repository | Plan | Test step |
|---|---|---|---|
| 1 | ai-jam-sessions | ready | `ci.yml` job ci, "Test with coverage" (Vitest) |
| 1 | ai-rpg-engine | ready | `ci.yml` job build-and-test, "Coverage" (Vitest) |
| 1 | claude-guardian | ready | `ci.yml` job build, step 5 (Vitest) |
| 1 | claude-rpg | person | Vitest through `npm run verify`, then `npm run test:coverage` |
| 1 | motif | ready | `ci.yml` job ci, "Test with coverage" (Vitest) |
| 1 | multi-claude | ready | `ci.yml` job ci, step 5 (Vitest) |
| 1 | runforge-vscode | ready | `ci.yml` job quality-gates, "Run tests with coverage" (Vitest) |
| 1 | audiobooker | ready | `ci.yml` job ci, "Run tests with coverage" (pytest) |
| 1 | backpropagate | ready | `ci.yml` job test, "Run tests with coverage" (pytest) |
| 1 | star-freight | ready | `ci.yml` job test, "Run tests with coverage (3.12 only)" (pytest) |
| 1 | tool-compass | ready | `ci.yml` job test, "Run tests with coverage" (pytest) |
| 1 | style-dataset-lab | ready | `ci.yml` job verify, "Coverage (Node 22 only)" (node --test with c8) |
| 2 | ai-playtest | person | Vitest through `npm run verify`, then `npm test` |
| 2 | brand | ready | `ci.yml` job lint-test-build, "Test (with coverage)" (Vitest) |
| 2 | bytefit | person | node --test runs `dist/` built without source maps |
| 2 | claude-synergy | ready | `test.yml` job test, "Run tests with coverage" (Vitest) |
| 2 | escape-the-valley | ready | `ci.yml` job test, "Test" (pytest; coverage turned on) |
| 2 | loadout-os | person | node --test runs `dist/` built without source maps |
| 2 | mcp-stress-test | ready | `ci.yml` job test, "Run tests" (pytest) |
| 2 | ollama-intern-mcp | ready | `ci.yml` job verify, "Run tests (ubuntu/20 — records the pass count)" (Vitest) |
| 2 | portlight | ready | `ci.yml` job test, "Test" (pytest; coverage turned on) |
| 2 | prompt-craft | person | pytest through `verify.py` |
| 2 | registry-sync | ready | `ci.yml` job test, step 5 (Vitest) |
| 2 | repo-knowledge | ready | `ci.yml` job build-and-test, step 8 (Vitest; coverage turned on) |
| 2 | research-os | ready | `ci.yml` job verify, "Coverage" (Vitest) |
| 2 | roll | person | Vitest through `npm run verify`, then `npm test` |
| 2 | sovereign | person | plain node scripts, which write no test results |
| 2 | vocal-synth-engine | ready | `ci.yml` job lint-and-test, "Test" (Vitest; coverage turned on) |
| 2 | world-forge | ready | `ci.yml` job build-and-test, "Re-run suite with coverage" (Vitest) |

Some comments in the repositories are about the old Codecov step, and they go stale with this change. The tool does not rewrite prose, so each pull request fixes those by hand:
- world-forge says its Codecov step was removed and why;
- the vitest configuration of ai-jam-sessions describes the old tokenless upload.

## Confirming delivery

A pull request's `codecov` job fails when Codecov refuses a report, so a green run means the reports were accepted. What CI cannot show is the branch Codecov treats as the default.

Codecov keeps the default branch it first saw. comfy-headless stayed on `master` after GitHub moved to `main`, until that was changed by hand. In that state, every upload from `main` lands on a branch Codecov does not show.

After a repository's first upload from its default branch, run `delivered`. For a checkout, it compares Codecov's branch with the checkout's `origin/HEAD`. For `owner/name`, it flags any branch other than `main`. It reads `https://api.codecov.io/api/v2/github/<owner>/repos/<name>/`, so behind a proxy set `NODE_USE_ENV_PROXY=1`.
