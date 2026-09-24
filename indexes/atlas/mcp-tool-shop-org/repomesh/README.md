# repomesh: how it works

Mapped at 2026-09-24 from commit 609c77d.

## What this is

18 parts, mostly JavaScript (175 files). Work enters through 9 doors; the busiest is pages-ci, which reaches 6 parts. It publishes to npm and a container image. People run repomesh.

## What changed since 2026-09-23 (f13ad8e)

- anchor-xrpl now also runs packages/repomesh-cli/scripts/build.mjs.
- anchor-xrpl now also checks anchor/xrpl/config.json, anchor/xrpl/package-lock.json, anchor/xrpl/package.json and 5 more.
- attestor-ci now also checks LICENSE.
- And 3 more changes to doors.
- anchor/xrpl/anchor-result.json is now written by anchor/xrpl/scripts/post-anchor.mjs.
- anchor/xrpl/partition-root.json is now written by anchor/xrpl/scripts/compute-root.mjs.
- pages/out is now written by pages/build-pages.mjs and pages/build-status.mjs.
- And 88 more new writers and readers of places.
- .github was mixed and is now authored.
- pages was mixed and is now authored.
- the repository root was mixed and is now authored.
- And 1 more origin change.
- 296 files changed content, across 17 parts.

## What comes in

1. **pages-ci.** On a push to main touching 6 paths; or by hand. Runs pages/build-metrics.mjs, pages/build-pages.mjs, pages/build-stats.mjs and 6 more.
2. **anchor-xrpl.** On a schedule (`0 0 * * *`); or by hand. Runs anchor/xrpl/scripts/compute-root.mjs, anchor/xrpl/scripts/emit-anchor-event.mjs, packages/repomesh-cli/scripts/build.mjs and 1 more; checks anchor/xrpl/config.json, anchor/xrpl/package-lock.json, anchor/xrpl/package.json and 4 more.
3. **Release.** When a release is published; or by hand. Runs packages/repomesh-cli/scripts/build.mjs and packages/repomesh-cli/tests/; checks anchor/xrpl/config.json, anchor/xrpl/package-lock.json, anchor/xrpl/package.json and 4 more.
4. **attestor-ci.** On a schedule (`0 */6 * * *`); or by hand. Runs attestor/scripts/attest-release.mjs, policy/scripts/check-policy.mjs, verifiers/license/scripts/verify-license.mjs and 2 more; checks LICENSE.
5. **registry-ci.** On a push to main touching 5 paths; or by hand. Runs registry/scripts/build-anchors.mjs, registry/scripts/build-badges.mjs, registry/scripts/build-dependencies.mjs and 4 more.
6. **ledger-ci.** On a pull request touching 9 paths; or by hand. Runs ledger/scripts/validate-ledger.mjs.
7. **xrpl-watch.** On a schedule (`0 12 * * 1`), Monday at 12:00 UTC; or by hand. Runs anchor/xrpl/scripts/watch.mjs.
8. **repomesh-broadcast.** When a release is published; or by hand. Runs packages/repomesh-cli/scripts/build.mjs.
9. **repomesh** (a command people run). Runs packages/repomesh-cli/dist/cli.mjs, built from a source this map cannot place.

## What happens through pages-ci

1. The workflow runs 4 files in pages, registry/scripts/build-anchors.mjs, registry/scripts/build-badges.mjs and registry/scripts/build-snippets.mjs in registry, and site/astro.config.mjs and site/src/ in site.
2. That reaches anchor (1 file) and verifiers (4 files).
3. That reaches ledger (1 file).
4. It writes to registry/badges/ and registry/snippets/.
5. It deploys the site.

## Who reads the results

- **registry/** is read by pages/build-pages.mjs.

## The other doors

**anchor-xrpl** runs anchor/xrpl/scripts/compute-root.mjs, anchor/xrpl/scripts/emit-anchor-event.mjs, packages/repomesh-cli/scripts/build.mjs and 1 more, checks anchor/xrpl/config.json, anchor/xrpl/package-lock.json, anchor/xrpl/package.json and 4 more, reaches verifiers, writes to anchor/xrpl/manifests/, ledger/events/events.jsonl and registry/anchors.json, commits anchor/xrpl/manifests/*.json, ledger/events/events.jsonl and registry/anchors.json, then pushes to a branch for review, never to main, opens an issue when it fails, and opens a pull request.

**Release** runs packages/repomesh-cli/scripts/build.mjs and packages/repomesh-cli/tests/, checks anchor/xrpl/config.json, anchor/xrpl/package-lock.json, anchor/xrpl/package.json and 4 more, reaches verifiers, and publishes to npm and a container image.

**attestor-ci** runs attestor/scripts/attest-release.mjs, policy/scripts/check-policy.mjs, verifiers/license/scripts/verify-license.mjs and 2 more, checks LICENSE, writes to ledger/events/events.jsonl, commits ledger/events/events.jsonl and pushes to a branch for review, never to main, opens an issue when it fails, and opens a pull request.

**registry-ci** runs registry/scripts/build-anchors.mjs, registry/scripts/build-badges.mjs, registry/scripts/build-dependencies.mjs and 4 more, reaches ledger and verifiers, writes to registry/anchors.json, registry/badges/, registry/capabilities.json, registry/dependencies.json, registry/nodes.json, registry/snippets/, registry/trust.json and registry/verifiers.json, commits registry/anchors.json, registry/badges/, registry/capabilities.json, registry/dependencies.json, registry/nodes.json, registry/snippets/, registry/trust.json and registry/verifiers.json, then pushes to a branch for review, never to main, and opens a pull request.

**ledger-ci** runs ledger/scripts/validate-ledger.mjs and reaches verifiers.

**xrpl-watch** runs anchor/xrpl/scripts/watch.mjs, reaches repomesh-cli, and opens an issue.

**repomesh-broadcast** runs packages/repomesh-cli/scripts/build.mjs, commits into a clone of mcp-tool-shop-org/repomesh and pushes there, and opens a pull request.

**repomesh** (a command people run) runs packages/repomesh-cli/dist/cli.mjs, built from a source this map cannot place.

## What breaks what

- **verifiers** is imported by 5 parts (anchor, attestor, ledger, registry, tools) and sits on the path of 6 doors.
- **anchor** is imported by 2 parts (pages, tools) and sits on the path of 4 doors.
- **repomesh-cli** is imported by 2 parts (anchor, tools) and sits on the path of 4 doors.
- **ledger** is imported by 1 part (registry), and by 1 more only from tests; it sits on the path of 3 doors.
- **registry** is imported only from tests, by 1 part (tools), and sits on the path of 3 doors.
- **the repository root** is imported by no other part and sits on the path of 3 doors.
- **ledger/events/events.jsonl** is written by .github, attestor and repomesh-cli, and read by .github, anchor, attestor, ledger, pages, policy, registry, repomesh-cli and tools; a hand edit reaches every reader.
- **ledger/nodes/** is written by attestor and tools, and read by attestor, ledger, policy, registry, repomesh-cli and tools; a hand edit reaches every reader.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

- **registry/capabilities.json** is written by .github/workflows/registry-ci.yml and registry/scripts/build-registry.mjs, and read by nothing else in this repository.
- **registry/dependencies.json** is written by .github/workflows/registry-ci.yml and registry/scripts/build-dependencies.mjs, and read by nothing else in this repository.
- **registry/snippets/** is written by .github/workflows/registry-ci.yml and registry/scripts/build-snippets.mjs, and read by nothing else in this repository.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **__deriveLegacyForTests** is exported by packages/repomesh-cli/src/verify/key-window.mjs (repomesh-cli) and verifiers/lib/key-window.mjs (verifiers); the two look alike.
- **deriveKeyWindowConstraints** is exported by packages/repomesh-cli/src/verify/key-window.mjs (repomesh-cli) and verifiers/lib/key-window.mjs (verifiers); the two look alike.
- **isKeyValidForSignature** is exported by packages/repomesh-cli/src/verify/key-window.mjs (repomesh-cli) and verifiers/lib/key-window.mjs (verifiers); the two look alike.
- **keyWindow** is exported by packages/repomesh-cli/src/verify/key-window.mjs (repomesh-cli) and verifiers/lib/key-window.mjs (verifiers); the two look alike.
- **mergeStricterWindow** is exported by packages/repomesh-cli/src/verify/key-window.mjs (repomesh-cli) and verifiers/lib/key-window.mjs (verifiers); the two look alike.

And 9 more pairs.

## Generated, never hand-edited

- **assets/** is written by repomesh-bot, which added every file in it.
- **ledger/nodes/** is written by attestor/scripts/emit-key-event.mjs and tools/join-node.mjs.
- **profiles/** is written by repomesh-bot, which added every file in it.
- **registry/anchors.json** is written by .github/workflows/anchor-xrpl.yml and .github/workflows/registry-ci.yml.
- **registry/badges/** is written by .github/workflows/registry-ci.yml and registry/scripts/build-badges.mjs.
- **registry/capabilities.json** is written by .github/workflows/registry-ci.yml and registry/scripts/build-registry.mjs.
- **registry/dependencies.json** is written by .github/workflows/registry-ci.yml and registry/scripts/build-dependencies.mjs.
- **registry/nodes.json** is written by .github/workflows/registry-ci.yml and registry/scripts/build-registry.mjs.
- **registry/snippets/** is written by .github/workflows/registry-ci.yml and registry/scripts/build-snippets.mjs.
- **registry/trust.json** is written by .github/workflows/registry-ci.yml.
- **registry/verifiers.json** is written by .github/workflows/registry-ci.yml and registry/scripts/build-verifiers.mjs.
- **scripts/** is written by repomesh-bot, which added every file in it.
- **templates/** is written by repomesh-bot, which added every file in it.

## Hand-authored

People write .github/, docs/, the repository root, schemas/ and site/; 9 writes with paths built at run time may land here.

- **anchor/xrpl/manifests/** is written by .github/workflows/anchor-xrpl.yml and anchor/xrpl/scripts/compute-root.mjs, and by people: 5 of its 7 commits in the window are theirs.
- **ledger/events/events.jsonl** is written by .github/workflows/anchor-xrpl.yml, .github/workflows/attestor-ci.yml, attestor/scripts/emit-key-event.mjs and packages/repomesh-cli/src/key/rotate-revoke.mjs, and by people: 14 of its 27 commits in the window are theirs.

## Where to start

.github/workflows/ledger-ci.yml → ledger/scripts/validate-ledger.mjs → verifiers/lib/anchor-notes.mjs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 103 import sites could not be resolved.
- 9 writes and 62 reads use paths built at run time and are not named here.
- 19 writes go to places this repository does not track, so they are not listed as generated.
- 33 writes and 104 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 49 commands are built at run time and not followed, 35 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
