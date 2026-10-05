# cognate: how it works

Mapped at 2026-10-05 from commit 3248883 by Atlas 1.26.0.

## What this is

14 parts, mostly TypeScript (66 files), CSS (2), JavaScript (2) and Astro (1). Work enters through 6 doors; Docker Publish and Publish to GHCR each reach 9 parts, and Docker Publish is followed because it comes first by name. It publishes @mcptoolshop/cognate to npm and a container image. It deploys a site to GitHub Pages. People import @mcptoolshop/cognate.

## What changed since 2026-10-01 (a3cbcc0)

Nothing structural changed since 2026-10-01; 7 files changed content.

## What comes in

1. **Docker Publish.** When a tag matching `v*` is pushed; or by hand. Runs packages/node/src/index.ts; builds packages/agent-identity/src/, packages/model-registry/src/, packages/node/src/ and 12 more; packs package.json, packages/, packages/agent-identity/package.json and 10 more into an image.
2. **Publish to GHCR.** When a release is published; or by hand. Runs packages/node/src/index.ts; builds packages/agent-identity/src/, packages/model-registry/src/, packages/node/src/ and 12 more; packs package.json, packages/, packages/agent-identity/package.json and 10 more into an image.
3. **CI.** On a pull request to main touching 6 paths; on a push to main touching 6 paths; or by hand. Runs packages/agent-identity/tests/, packages/model-registry/tests/, packages/node/tests/ and 4 more; builds packages/cognate/src/agent-identity.ts, packages/cognate/src/index.ts, packages/cognate/src/model-registry.ts and 38 more.
4. **Release.** When a tag matching `v*` is pushed. Runs packages/agent-identity/tests/, packages/cognate/tests/, packages/model-registry/tests/ and 10 more; builds packages/cognate/src/agent-identity.ts, packages/cognate/src/index.ts, packages/cognate/src/model-registry.ts and 38 more.
5. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
6. **@mcptoolshop/cognate** (the package people import). Loads packages/cognate/dist/index.d.ts, built from a source this map cannot place.

## What happens through Docker Publish

1. The workflow runs packages/node/src/index.ts in node; it builds packages/agent-identity/src/ in agent-identity, packages/model-registry/src/ in model-registry, packages/node/src/ in node, packages/policy/src/ in policy, packages/prompt-store/src/ in prompt-store, and 5 files in 2 more parts; it packs packages/agent-identity/package.json in agent-identity, packages/cognate/package.json in cognate, packages/model-registry/package.json in model-registry, packages/node/package.json in node, packages/policy/package.json in policy, and 71 files in 5 more places into an image.
2. It publishes a container image.

## Who reads the results

Docker Publish writes nothing this map can see.

## The other doors

**Publish to GHCR** runs packages/node/src/index.ts, builds packages/agent-identity/src/, packages/model-registry/src/, packages/node/src/ and 12 more, packs package.json, packages/, packages/agent-identity/package.json and 10 more into an image, and publishes a container image.

**CI** runs packages/agent-identity/tests/, packages/model-registry/tests/, packages/node/tests/ and 4 more, and builds packages/cognate/src/agent-identity.ts, packages/cognate/src/index.ts, packages/cognate/src/model-registry.ts and 38 more.

**Release** runs packages/agent-identity/tests/, packages/cognate/tests/, packages/model-registry/tests/ and 10 more, builds packages/cognate/src/agent-identity.ts, packages/cognate/src/index.ts, packages/cognate/src/model-registry.ts and 38 more, publishes @mcptoolshop/cognate to npm, and creates a GitHub release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**@mcptoolshop/cognate** (the package people import) loads packages/cognate/dist/index.d.ts, built from a source this map cannot place.

## What breaks what

- **types** is imported by 6 parts (agent-identity, cognate, model-registry, node, policy, prompt-store) and sits on the path of 4 doors.
- **agent-identity** is imported by 2 parts (cognate, node) and sits on the path of 4 doors.
- **model-registry** is imported by 2 parts (cognate, node) and sits on the path of 4 doors.
- **policy** is imported by 2 parts (cognate, node) and sits on the path of 4 doors.
- **prompt-store** is imported by 2 parts (cognate, node) and sits on the path of 4 doors.
- **repomesh-bridge** is imported by 2 parts (cognate, node) and sits on the path of 4 doors.
- **cognate** is imported by no other part and sits on the path of 4 doors.
- **node** is imported by no other part and sits on the path of 4 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **scripts** is imported by no test.

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

- 3 writes and 15 reads go to a path their caller passes, not to this repository.
- There is a docker-compose.yml that no workflow runs; what deploys from it does so from outside this repository, and is not on this page.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
