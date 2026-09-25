# repo-knowledge: how it works

Mapped at 2026-09-25 from commit 4435870.

## What this is

11 parts, mostly Markdown (646 files); code in TypeScript (84) and JavaScript (10). Work enters through 5 doors; CI and Release each reach 3 parts, and CI is followed because a pull request goes through it. It publishes to npm. People run rk. People import @mcptoolshop/repo-knowledge.

## What changed since 2026-09-23 (8236017)

- src no longer imports the repository root.
- CI's pull request trigger now also names `eslint.config.js`, `scripts/postbuild.js`, `tsup.config.ts` and `vitest.config.ts`.
- CI's push trigger now also names `eslint.config.js`, `scripts/postbuild.js`, `tsup.config.ts` and `vitest.config.ts`.
- CI now also builds src/cli.ts, src/index.ts and src/mcp/server.ts.
- And 4 more changes to doors.
- dist is now written by scripts/postbuild.js.
- .github/workflows/ci.yml is now read by test/build-health.test.ts, test/doctor.test.ts, test/feed.test.ts, test/health-commands.test.ts, test/migration-009.test.ts and test/table.test.ts.
- .github/workflows/release.yml is now read by test/build-health.test.ts.
- And 12 more new writers and readers of places.
- data was generated and is now authored.
- 775 files changed content, across 10 parts.

## What comes in

1. **CI.** On a pull request touching 14 paths; on a push to main touching 14 paths; or by hand. Runs scripts/postbuild.js and test/; builds src/cli.ts, src/index.ts and src/mcp/server.ts; checks src/.
2. **Release.** When a tag matching `v*.*.*` is pushed; or by hand. Runs scripts/gen-audit-report.mjs, scripts/gen-worklist.mjs, scripts/postbuild.js and 48 more; builds src/cli.ts, src/index.ts and src/mcp/server.ts; checks src/.
3. **Deploy site to GitHub Pages.** On a pull request to main touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **@mcptoolshop/repo-knowledge** (the package people import). Loads src/index.ts and src/mcp/server.ts.
5. **rk** (a command people run). Runs src/cli.ts.

## What happens through CI

1. The workflow runs scripts/postbuild.js in scripts and test/ in test; it builds src/cli.ts, src/index.ts and src/mcp/server.ts in src; it checks src/ in src.
2. It writes to dist/, which is not tracked.

## Who reads the results

CI writes only to dist/, which is not tracked.

## The other doors

**Release** runs scripts/gen-audit-report.mjs, scripts/gen-worklist.mjs, scripts/postbuild.js and 48 more, builds src/cli.ts, src/index.ts and src/mcp/server.ts, checks src/, writes to dist/, which is not tracked, and publishes to npm, creates a GitHub release, and uploads sbom.json to the release, on a tag push.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on a push to main or by hand.

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

.github/workflows/ci.yml → src/index.ts → src/config.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 import could not be resolved: `src/mcp/server.ts` imports `zod`, which is not declared.
- 3 writes and 15 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 2 writes and 77 reads go to a path their caller passes, not to this repository.
- 4 writes and 13 reads go to the directory the command is run in (CHANGELOG.md, LICENSE, README.md and 5 more places), not to this repository.
- 2 commands are built at run time and not followed.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
