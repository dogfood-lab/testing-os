# repo-knowledge: how it works

Mapped at 2026-09-24 from commit 4435870.

## What this is

11 parts, mostly TypeScript (84 files). Work enters through 5 doors; CI and Release each reach 3 parts, and CI is followed because a pull request goes through it. It publishes to npm. People run rk. People import @mcptoolshop/repo-knowledge.

## What changed since 2026-09-23 (8236017)

- src no longer imports the repository root.
- CI's pull request trigger now also names `eslint.config.js`, `scripts/postbuild.js`, `tsup.config.ts` and `vitest.config.ts`.
- CI's push trigger now also names `eslint.config.js`, `scripts/postbuild.js`, `tsup.config.ts` and `vitest.config.ts`.
- Deploy site to GitHub Pages now also runs site/astro.config.mjs and site/src/.
- And 2 more changes to doors.
- .github/workflows/ci.yml is now read by test/build-health.test.ts, test/doctor.test.ts, test/feed.test.ts, test/health-commands.test.ts, test/migration-009.test.ts and test/table.test.ts.
- .github/workflows/release.yml is now read by test/build-health.test.ts.
- CHANGELOG.md is now also read by src/sync/local.ts and test/version.test.ts.
- And 14 more new writers and readers of places.
- data was generated and is now authored.
- 775 files changed content, across 10 parts.

## What comes in

1. **CI.** On a pull request touching 14 paths; on a push to main touching 14 paths; or by hand. Runs scripts/postbuild.js and test/; checks src/.
2. **Release.** When a tag matching `v*.*.*` is pushed; or by hand. Runs scripts/gen-audit-report.mjs, scripts/gen-worklist.mjs, scripts/postbuild.js and 48 more; checks src/.
3. **Deploy site to GitHub Pages.** On a pull request touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **@mcptoolshop/repo-knowledge** (the package people import). Loads src/index.ts and src/mcp/server.ts.
5. **rk** (a command people run). Runs src/cli.ts.

## What happens through CI

1. The workflow runs scripts/postbuild.js in scripts and test/ in test; it checks src/ in src.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs scripts/gen-audit-report.mjs, scripts/gen-worklist.mjs, scripts/postbuild.js and 48 more, checks src/, publishes to npm on a tag push, and creates a GitHub release on a tag push.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on a push to main.

**@mcptoolshop/repo-knowledge** (the package people import) loads src/index.ts and src/mcp/server.ts.

**rk** (a command people run) runs src/cli.ts and runs gh and git.

## What breaks what

- **src** is imported only from tests, by 1 part (test), and sits on the path of 4 doors.
- **scripts** is imported by no other part and sits on the path of 2 doors.
- **test** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **src/mcp/server.ts** and **test/mcp-server.test.ts** changed together in 6 of 7 commits, and the test part imports the src part.
- **src/db/init.ts** and **test/migration-sequence.test.ts** changed together in 10 of 13 commits, and the test part imports the src part.
- **src/index.ts** and **test/migration-sequence.test.ts** changed together in 7 of 10 commits, and the test part imports the src part.
- **src/index.ts** and **src/sync/index.ts** changed together in 5 of 8 commits, inside the src part.
- **test/migration-sequence.test.ts** and **test/publish-state.test.ts** changed together in 6 of 10 commits, inside the test part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 3 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **scripts** is imported by no test.

## Written but never read

- **AUDIT-WORKLIST.md** is written by scripts/gen-audit-worklist.mjs and read by nothing else in this repository.
- **ENRICHMENT-WORKLIST.md** is written by scripts/gen-enrichment-worklist.mjs and read by nothing else in this repository.
- **REMEDIATION-CHECKLIST.md** is written by scripts/gen-remediation-checklist.mjs and read by nothing else in this repository.
- **REMEDIATION-WORKLIST.md** is written by scripts/gen-worklist.mjs when run without --selftest and read by nothing else in this repository.
- **audit_report.md** is written by scripts/gen-audit-report.mjs when run without --selftest and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **AUDIT-WORKLIST.md** is written by scripts/gen-audit-worklist.mjs.
- **ENRICHMENT-WORKLIST.md** is written by scripts/gen-enrichment-worklist.mjs.
- **REMEDIATION-CHECKLIST.md** is written by scripts/gen-remediation-checklist.mjs.
- **REMEDIATION-WORKLIST.md** is written by scripts/gen-worklist.mjs when run without --selftest.
- **audit_report.md** is written by scripts/gen-audit-report.mjs when run without --selftest.

## Hand-authored

People write .claude/, .github/, assets/, data/, research/, site/ and templates/; 3 writes with paths built at run time may land here.

## Where to start

src/cli.ts

Read those in order to follow one run of rk end to end. This path follows rk (a command people run) from its entry, since CI runs only tests and scripts that import no code here.

## What this map cannot see

- 1 import site could not be resolved.
- 3 writes and 15 reads use paths built at run time and are not named here.
- 6 writes and 85 reads go to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository.
- 2 commands are built at run time and not followed.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
