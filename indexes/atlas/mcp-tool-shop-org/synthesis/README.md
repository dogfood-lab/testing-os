# synthesis: how it works

Mapped at 2026-09-26 from commit dd0e1de by Atlas 1.23.0.

## What this is

12 parts, mostly Markdown (83 files) and JSON data (16); code in TypeScript (36), JavaScript (6), Astro (3) and CSS (2). Work enters through 5 doors; CI and Release (npm via Trusted Publishing) each reach 3 parts, and CI is followed because a pull request goes through it. It publishes to npm. It deploys a site to GitHub Pages. People run synthesis. People import @mcptoolshop/synthesis.

## What changed since 2026-09-23 (0128f11)

- CI now also runs src/index.ts.
- Deploy site to GitHub Pages now also runs site/astro.config.mjs and site/src/.
- Release (npm via Trusted Publishing) now also runs src/index.ts.
- And 2 more changes to doors.
- CHANGELOG.md is now also read by tests/version-alignment.test.ts.
- data/DATASHEET.md is now read by tests/fairness.test.ts.
- data/evals.jsonl is now also read by tests/fairness.test.ts and tests/planted-theater.test.ts.
- And 13 more new writers and readers of places.
- 153 files changed content, across 11 parts.

## What comes in

1. **CI.** On a pull request to main; on a push to main touching 13 paths; or by hand. Runs scripts/check-report-schema.mjs, scripts/eval-planted.mjs, src/index.ts and 16 more; builds src/.
2. **Release (npm via Trusted Publishing).** When a release is published; or by hand. Runs scripts/check-report-schema.mjs, src/index.ts and tests/; builds src/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **@mcptoolshop/synthesis** (the package people import). Loads src/index.ts.
5. **synthesis** (a command people run). Runs src/index.ts.

## What happens through CI

1. The workflow runs scripts/check-report-schema.mjs and scripts/eval-planted.mjs in scripts, src/index.ts in src, and tests/ in tests; it builds src/ in src.
   1. Inside src/index.ts, `main` does, in order: `loadCases`, `runAllCases`, `writeReport`, `hasColors`, `printSummary` and `formatArtifact`.
   2. Or, when `options.planted`, `main` does `evaluatePlanted` instead.
   3. Or, when `isJsonOutput()`, `main` does `printSummary` instead.
   4. **`runAllCases`** runs, in order: `checkAgency`, `checkReassurance`, `checkPivot`, `checkPerformativeEmpathy`, `checkGroundedUptake` and `computeRelationalPosture`.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release (npm via Trusted Publishing)** runs scripts/check-report-schema.mjs, src/index.ts and tests/, builds src/, and publishes to npm.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**@mcptoolshop/synthesis** (the package people import) loads src/index.ts.

**synthesis** (a command people run) runs src/index.ts.

## What breaks what

- **src** is imported by 1 part (scripts), and by 1 more only from tests; it sits on the path of 4 doors.
- **scripts** is imported by no other part and sits on the path of 2 doors.
- **tests** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **src/report.ts** and **src/runner.ts** changed together in 8 of 10 commits, inside the src part.
- **src/report.ts** and **src/types.ts** changed together in 9 of 15 commits, inside the src part.
- **src/checks/performative.ts** and **tests/checks.performative.test.ts** changed together in 6 of 10 commits, and the tests part imports the src part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 3 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **scripts** is imported by no test.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **src/checks/lexicons/concreteness.ts** is written by scripts/build-concreteness.mjs.

## Hand-authored

People write .claude/, .github/, assets/, data/, docs/, research/, the repository root, schemas/ and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → src/index.ts → src/load.ts → src/color.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 import site names a path outside this repository, so what it loads is not followed.
- 3 writes and 6 reads go to a path their caller passes, not to this repository.
- 3 reads go to the directory the command is run in (data/ and schemas/), not to this repository.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
