# claude-synergy: how it works

Mapped at 2026-09-24 from commit 6d91d8c.

## What this is

10 parts, mostly TypeScript (83 files). Work enters through 7 doors; the busiest is Daily sync, which reaches 1 part and commits into the repository (Tests reaches 2 but commits nothing). It publishes to npm. People run claude-synergy-mcp and hk. People import @mcptoolshop/claude-synergy.

## What changed since 2026-09-24 (fb90b80)

Nothing structural changed since 2026-09-24; 1701 files changed content.

## What comes in

1. **Tests.** On a pull request; on a push to main; or by hand. Runs test/integration/, test/regression/ and test/unit/; checks src/.
2. **Release.** When a tag matching `v*` is pushed; or by hand. Runs test/integration/, test/regression/ and test/unit/; checks src/cli.ts and src/mcp-server.ts.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **Daily sync.** On a schedule (`0 12 * * *`); or by hand. Runs src/cli.ts; checks src/mcp-server.ts.
5. **@mcptoolshop/claude-synergy** (the package people import). Loads src/cli.ts and src/mcp-server.ts.
6. **claude-synergy-mcp** (a command people run). Runs src/mcp-server.ts.
7. **hk** (a command people run). Runs src/cli.ts.

## What happens through Daily sync

1. The workflow runs src/cli.ts in src; it checks src/mcp-server.ts in src.
2. It writes to SOURCES.md, URGENT_FINDINGS.md and products/.
3. It commits LATEST.txt, PRODUCTS.txt, SOURCES.md, URGENT_FINDINGS.md, data/ and products/, then pushes.
4. It runs gh.

## Who reads the results

- **products/** is read by scripts/verify-citations-sample.mjs, and by 1 test.

## The other doors

**Tests** runs test/integration/, test/regression/ and test/unit/, and checks src/.

**Release** runs test/integration/, test/regression/ and test/unit/, checks src/cli.ts and src/mcp-server.ts, publishes to npm, and creates a GitHub release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**@mcptoolshop/claude-synergy** (the package people import) loads src/cli.ts and src/mcp-server.ts.

**claude-synergy-mcp** (a command people run) runs src/mcp-server.ts and runs gh.

**hk** (a command people run) runs src/cli.ts and runs gh.

## What breaks what

- **src** is imported only from tests, by 1 part (test), and sits on the path of 6 doors.
- **test** is imported by no other part and sits on the path of 2 doors.
- **dataset/changelog-actions/v1/entries/** is written by scripts and read by scripts; a hand edit reaches every reader.
- **dataset/changelog-actions/v1/holdout.jsonl** is written by scripts and read by scripts; a hand edit reaches every reader.

## What tends to change together

- **src/fetch.ts** and **src/mcp-server.ts** changed together in 4 of 6 commits, inside the src part.
- **src/cli.ts** and **src/fetch.ts** changed together in 4 of 7 commits, inside the src part.
- **src/fetch.ts** and **test/regression/bugs.test.ts** changed together in 4 of 7 commits, and the test part imports the src part.
- **src/mcp-server.ts** and **test/regression/bugs.test.ts** changed together in 4 of 7 commits, and the test part imports the src part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **scripts** is imported by no test.

## Written but never read

- **SOURCES.md** is written by .github/workflows/sync.yml and read by nothing else in this repository.
- **URGENT_FINDINGS.md** is written by .github/workflows/sync.yml and read by nothing else in this repository.
- **dataset/changelog-actions/v1/eval-report-run1.json** is written by scripts/eval-cs-actions.mjs and read by nothing else in this repository.
- **dataset/changelog-actions/v1/eval-report.v1.json** is written by scripts/eval-cs-actions.mjs and read by nothing else in this repository.
- **dataset/changelog-actions/v1/judge-report.json** is written by scripts/judge-dataset.mjs and read by nothing else in this repository.
- **dataset/changelog-actions/v1/manifest.json** is written by scripts/build-dataset.mjs and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **SOURCES.md** is written by .github/workflows/sync.yml.
- **URGENT_FINDINGS.md** is written by .github/workflows/sync.yml.
- **dataset/changelog-actions/v1/entries/** is written by scripts/apply-a3c-review.mjs.
- **dataset/changelog-actions/v1/eval-report-run1.json** is written by scripts/eval-cs-actions.mjs.
- **dataset/changelog-actions/v1/eval-report.v1.json** is written by scripts/eval-cs-actions.mjs.
- **dataset/changelog-actions/v1/holdout.jsonl** is written by scripts/build-dataset.mjs.
- **dataset/changelog-actions/v1/judge-report.json** is written by scripts/judge-dataset.mjs.
- **dataset/changelog-actions/v1/manifest.json** is written by scripts/build-dataset.mjs.
- **dataset/changelog-actions/v1/training.jsonl** is written by scripts/build-dataset.mjs.

## Hand-authored

People write .github/, docs/, site/ and synergies/. Nothing in this repository writes to them.

- **products/** is written by .github/workflows/sync.yml, and by people: 7 of its 7 commits in the window are theirs.

## Where to start

.github/workflows/test.yml → src/cli.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 5 reads use paths built at run time and are not named here.
- 10 writes and 45 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 5 commands are built at run time and not followed, 4 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
