# db-cluster: how it works

Mapped at 2026-09-24 from commit f1d79e0.

## What this is

13 parts, mostly TypeScript (253 files). Work enters through 9 doors; CI and Release each reach 5 parts, and CI is followed because a pull request goes through it. It publishes to npm and a container image. People run db-cluster and db-cluster-mcp. People import @mcptoolshop/db-cluster.

## What changed since 2026-09-23 (2fb8e75)

- dashboard no longer imports src.
- examples no longer imports src.
- CI now also runs test/actor-required-regression.test.ts, test/backend-env-surfaces.test.ts, test/exit-code-tables-regression.test.ts and 3 more.
- Docker Publish now also runs src/cli.ts.
- Docker Publish now also checks LICENSE, README.md, docs/ and 4 more.
- And 4 more changes to doors.
- examples/dogfood-project-memory/.db-cluster is now written by src/adapters/local/index.ts.
- .github/workflows/ci.yml is now read by test/wave-b1-cidocs-regression.test.ts.
- .github/workflows/release-gate.yml is now read by test/wave-b1-cidocs-regression.test.ts.
- And 133 more new writers and readers of places.
- 7 files added and 423 changed content, across 13 parts.

## What comes in

1. **CI.** On a pull request; on a push; or by hand. Runs test/actor-required-regression.test.ts, test/adapters.test.ts, test/backend-env-surfaces.test.ts and 120 more; checks examples/ and src/.
2. **Release.** When a tag matching `v*` is pushed. Runs test/actor-required-regression.test.ts, test/adapters.test.ts, test/backend-env-surfaces.test.ts and 120 more; checks examples/ and src/.
3. **Release Gate.** On a push to main; when a tag matching `v*` is pushed; or by hand. Runs scripts/completeness-checks.mjs, scripts/doc-drift.mjs, scripts/jsdoc-gate.mjs and 125 more; checks src/.
4. **Smoke Install.** On a pull request touching 1 path; when a tag matching `v*` is pushed; or by hand. Runs scripts/smoke-install.mjs; checks src/.
5. **Docker Publish.** When a tag matching `v*` is pushed; or by hand. Runs src/cli.ts; checks LICENSE, README.md, docs/ and 102 more.
6. **Deploy site to GitHub Pages.** On a pull request touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
7. **@mcptoolshop/db-cluster** (the package people import). Loads src/index.ts, src/mcp/index.ts, src/policy/index.ts and 3 more.
8. **db-cluster** (a command people run). Runs src/cli.ts.
9. **db-cluster-mcp** (a command people run). Runs src/mcp/server.ts.

## What happens through CI

1. The workflow runs 123 files in test; it checks examples/ in examples and src/ in src.
2. That reaches dashboard (1 file) and scripts (4 files).

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs test/actor-required-regression.test.ts, test/adapters.test.ts, test/backend-env-surfaces.test.ts and 120 more, checks examples/ and src/, reaches dashboard and scripts, publishes to npm, and creates a GitHub release.

**Release Gate** runs scripts/completeness-checks.mjs, scripts/doc-drift.mjs, scripts/jsdoc-gate.mjs and 125 more, checks src/, and reaches dashboard.

**Smoke Install** runs scripts/smoke-install.mjs and checks src/.

**Docker Publish** runs src/cli.ts, checks LICENSE, README.md, docs/ and 102 more, and publishes a container image.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on a push to main.

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

- **src/mcp/server.ts** and **src/sdk/cluster-sdk.ts** changed together in 7 of 9 commits, inside the src part.
- **scripts/completeness-checks.mjs** and **src/mcp/server.ts** changed together in 5 of 9 commits, and the scripts part imports the src part.
- **src/kernel/policy-enforced-kernel.ts** and **src/mcp/server.ts** changed together in 5 of 10 commits, inside the src part.
- **src/kernel/policy-enforced-kernel.ts** and **src/sdk/cluster-sdk.ts** changed together in 5 of 10 commits, inside the src part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 2 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **examples** is imported by no test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, .stage-b-amend/, .stage-b-audit/, .verifier-outputs-b1/, .verifier-outputs/, docs/, the repository root and site/; 7 writes with paths built at run time may land here.

## Where to start

src/cli.ts

Read those in order to follow one run of db-cluster end to end. This path follows db-cluster (a command people run) from its entry, since CI runs only tests.

## What this map cannot see

- 17 import sites could not be resolved.
- 7 writes and 14 reads use paths built at run time and are not named here.
- 3 writes go to places this repository does not track, so they are not listed as generated.
- 54 writes and 106 reads go to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository.
- 1 command is built at run time and not followed, and it is in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
