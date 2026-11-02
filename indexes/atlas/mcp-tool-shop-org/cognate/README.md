# cognate: how it works

Mapped at 2026-11-02 from commit 90d8b20 by Atlas 1.26.0.

## What this is

14 parts, mostly TypeScript (119 files), JavaScript (5), CSS (2) and Astro (1). Work enters through 5 doors; CI, Publish to GHCR and Release each reach 9 parts, and CI is followed because a pull request goes through it. It publishes @mcptoolshop/cognate to npm and a container image. It deploys a site to GitHub Pages. People import @mcptoolshop/cognate.

## What changed since 2026-10-28 (f3f8a28)

Nothing structural changed since 2026-10-28; 23 files changed content.

## What comes in

1. **CI.** On a pull request to main; on a push to main touching 10 paths; or by hand. Runs packages/cognate/scripts/vendor-types.mjs, scripts/check-bundle-types.mjs, scripts/make-tenant-root.mjs and 42 more; builds packages/cognate/src/agent-identity.ts, packages/cognate/src/civility-kernel.ts, packages/cognate/src/index.ts and 61 more.
2. **Publish to GHCR.** When a release is published; on a `workflow_call` event; or by hand. Runs packages/node/src/index.ts; builds packages/agent-identity/src/, packages/civility-kernel/src/, packages/model-registry/src/ and 30 more; packs package.json, packages/, packages/agent-identity/package.json and 11 more into an image.
3. **Release.** When a tag matching `v*` is pushed. Runs packages/cognate/scripts/vendor-types.mjs, packages/node/src/index.ts, packages/agent-identity/tests/ and 40 more; builds packages/cognate/src/agent-identity.ts, packages/cognate/src/civility-kernel.ts, packages/cognate/src/index.ts and 61 more; packs package.json, packages/, packages/agent-identity/package.json and 11 more into an image.
4. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
5. **@mcptoolshop/cognate** (the package people import). Loads packages/cognate/dist/index.d.ts, built from a source this map cannot place.

## What happens through CI

1. The workflow runs packages/cognate/scripts/vendor-types.mjs and packages/cognate/tests/ in cognate, scripts/check-bundle-types.mjs and scripts/make-tenant-root.mjs in scripts, packages/agent-identity/tests/ in agent-identity, packages/model-registry/tests/ in model-registry, 11 files in node, and 24 files in 4 more places; it builds 8 files in cognate, packages/agent-identity/src/ in agent-identity, packages/model-registry/src/ in model-registry, packages/node/src/ in node, packages/policy/src/ in policy, and 26 files in 4 more places.
2. It writes to packages/cognate/dist/, which is not tracked.

## Who reads the results

CI writes only to packages/cognate/dist/, which is not tracked.

## The other doors

**Publish to GHCR** runs packages/node/src/index.ts, builds packages/agent-identity/src/, packages/civility-kernel/src/, packages/model-registry/src/ and 30 more, packs package.json, packages/, packages/agent-identity/package.json and 11 more into an image, and publishes a container image on a tag push.

**Release** runs packages/cognate/scripts/vendor-types.mjs, packages/node/src/index.ts, packages/agent-identity/tests/ and 40 more, builds packages/cognate/src/agent-identity.ts, packages/cognate/src/civility-kernel.ts, packages/cognate/src/index.ts and 61 more, packs package.json, packages/, packages/agent-identity/package.json and 11 more into an image, writes to packages/cognate/dist/, which is not tracked, publishes @mcptoolshop/cognate to npm and a container image, and creates a GitHub release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**@mcptoolshop/cognate** (the package people import) loads packages/cognate/dist/index.d.ts, built from a source this map cannot place.

## What breaks what

- **types** is imported by 6 parts (agent-identity, cognate, model-registry, node, policy, prompt-store) and sits on the path of 3 doors.
- **agent-identity** is imported by 2 parts (cognate, node) and sits on the path of 3 doors.
- **model-registry** is imported by 2 parts (cognate, node) and sits on the path of 3 doors.
- **policy** is imported by 2 parts (cognate, node) and sits on the path of 3 doors.
- **prompt-store** is imported by 2 parts (cognate, node) and sits on the path of 3 doors.
- **repomesh-bridge** is imported by 2 parts (cognate, node) and sits on the path of 3 doors.
- **node** is imported by 1 part (scripts) and sits on the path of 3 doors.
- **cognate** is imported by no other part and sits on the path of 3 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, docs/, the repository root, site/ and specs/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → packages/agent-identity/src/index.ts → packages/agent-identity/src/identity.ts → packages/types/src/index.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 8 imports could not be resolved: `scripts/bundle-types-fixture/consumer.ts` imports `@mcptoolshop/cognate`, which a build generates; `scripts/bundle-types-fixture/consumer.ts` imports `@mcptoolshop/cognate/policy`, which a build generates; `scripts/bundle-types-fixture/consumer.ts` imports `@mcptoolshop/cognate/types`, which a build generates; and 5 more.
- 3 reads use paths built at run time and are not named here.
- 3 writes go to places this repository does not track, so they are not listed as generated.
- 6 writes and 24 reads go to a path their caller passes, not to this repository.
- 3 reads go to the directory the command is run in, not to this repository.
- 4 commands are built at run time and not followed.
- 41 files belong to no part: packages/civility-kernel/CHANGELOG.md, packages/civility-kernel/LICENSE, packages/civility-kernel/package.json and 38 more.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
