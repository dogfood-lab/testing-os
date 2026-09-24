# db-cluster: how it works

Mapped at 2026-09-24 from commit f780866.

## What this is

13 parts, mostly TypeScript (247 files). Work enters through 9 doors; CI and Release each reach 5 parts, and CI is followed because a pull request goes through it. It publishes to npm and a container image. People run db-cluster and db-cluster-mcp. People import @mcptoolshop/db-cluster.

## What changed since 2026-09-23 (2fb8e75)

- dashboard no longer imports src.
- examples no longer imports src.
- Docker Publish now also runs src/cli.ts.
- Docker Publish now also checks LICENSE, README.md, docs/ and 4 more.
- Release Gate now also runs scripts/completeness-checks.mjs, scripts/doc-drift.mjs, scripts/jsdoc-gate.mjs and 118 more.
- And 1 more change to a door.
- examples/dogfood-project-memory/.db-cluster is now written by src/adapters/local/index.ts.
- .github/workflows/ci.yml is now read by test/wave-b1-cidocs-regression.test.ts.
- .github/workflows/release-gate.yml is now read by test/wave-b1-cidocs-regression.test.ts.
- And 108 more new writers and readers of places.
- 423 files changed content, across 13 parts.

## What comes in

1. **CI.** On a pull request; on a push; or by hand. Runs test/adapters.test.ts, test/backend-parity.test.ts, test/cli-docs.test.ts and 114 more; checks examples/ and src/.
2. **Release.** When a tag matching `v*` is pushed. Runs test/adapters.test.ts, test/backend-parity.test.ts, test/cli-docs.test.ts and 114 more; checks examples/ and src/.
3. **Release Gate.** On a push to main; when a tag matching `v*` is pushed; or by hand. Runs scripts/completeness-checks.mjs, scripts/doc-drift.mjs, scripts/jsdoc-gate.mjs and 119 more; checks src/.
4. **Smoke Install.** On a pull request touching 1 path; when a tag matching `v*` is pushed; or by hand. Runs scripts/smoke-install.mjs; checks src/.
5. **Docker Publish.** When a tag matching `v*` is pushed; or by hand. Runs src/cli.ts; checks LICENSE, README.md, docs/ and 102 more.
6. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
7. **@mcptoolshop/db-cluster** (the package people import). Loads src/index.ts, src/mcp/index.ts, src/policy/index.ts and 3 more.
8. **db-cluster** (a command people run). Runs src/cli.ts.
9. **db-cluster-mcp** (a command people run). Runs src/mcp/server.ts.

## What happens through CI

1. The workflow runs 117 files in test; it checks examples/ in examples and src/ in src.
2. That reaches dashboard (1 file) and scripts (4 files).

## Who reads the results

CI writes nothing in the files this map could read; 2 files could not be.

## The other doors

**Release** runs test/adapters.test.ts, test/backend-parity.test.ts, test/cli-docs.test.ts and 114 more, checks examples/ and src/, reaches dashboard and scripts, publishes to npm, and creates a GitHub release.

**Release Gate** runs scripts/completeness-checks.mjs, scripts/doc-drift.mjs, scripts/jsdoc-gate.mjs and 119 more, checks src/, and reaches dashboard.

**Smoke Install** runs scripts/smoke-install.mjs and checks src/.

**Docker Publish** runs src/cli.ts, checks LICENSE, README.md, docs/ and 102 more, and publishes a container image.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**@mcptoolshop/db-cluster** (the package people import) loads src/index.ts, src/mcp/index.ts, src/policy/index.ts and 3 more.

**db-cluster** (a command people run) runs src/cli.ts.

**db-cluster-mcp** (a command people run) runs src/mcp/server.ts.

## What breaks what

- **src** is imported by 1 part (scripts), and by 1 more only from tests; it sits on the path of 8 doors.
- **test** is run as a child process by 1 part (scripts) and sits on the path of 3 doors.
- **scripts** is imported only from tests, by 1 part (test), and sits on the path of 4 doors.
- **dashboard** is imported only from tests, by 1 part (test), and sits on the path of 3 doors.
- **examples** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **src/mcp/server.ts** and **src/sdk/cluster-sdk.ts** changed together in 6 of 7 commits, inside the src part.
- **scripts/completeness-checks.mjs** and **src/mcp/server.ts** changed together in 5 of 8 commits, and the scripts part imports the src part.
- **src/kernel/policy-enforced-kernel.ts** and **src/sdk/cluster-sdk.ts** changed together in 5 of 8 commits, inside the src part.
- **src/kernel/policy-enforced-kernel.ts** and **src/mcp/server.ts** changed together in 5 of 9 commits, inside the src part.
- **scripts/completeness-checks.mjs** and **src/sdk/cluster-sdk.ts** changed together in 4 of 8 commits, and the scripts part imports the src part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 2 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **examples** is imported by no test.

## Written but never read

No place is written by the files this map could read, so none goes unread; 2 files could not be.

## Helpers that look duplicated

No two parts export a helper that looks alike in the files this map could read; 2 files could not be.

## Generated, never hand-edited

Nothing in the files this map could read writes to a tracked place; 2 files could not be.

## Hand-authored

People write .github/, .stage-b-amend/, .stage-b-audit/, .verifier-outputs-b1/, .verifier-outputs/, docs/, the repository root and site/; 7 writes with paths built at run time may land here.

## Where to start

src/cli.ts

Read those in order to follow one run of db-cluster end to end. This path follows db-cluster (a command people run) from its entry, since CI runs only tests.

## What this map cannot see

- 17 import sites could not be resolved.
- 2 files in test use syntax the parser cannot read (test/wave-a4-kernel-regression.test.ts and test/wave-s2a2-policy-regression.test.ts), so what they import is not known: a NUL character inside a string (1) and other syntax (1).
- 7 writes and 16 reads use paths built at run time and are not named here.
- 3 writes go to places this repository does not track, so they are not listed as generated.
- 49 writes and 106 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 1 command is built at run time and not followed, and it is in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
