# repomesh: how it works

Mapped at 2026-09-23 from commit 609c77d.

## What this is

18 parts, mostly JavaScript (175 files). Work enters through 8 doors; the busiest is attestor-ci, which reaches 4 parts and commits into the repository (pages-ci reaches 6 but commits nothing). It publishes to npm and a container image.

## What changed since 2026-09-23 (f13ad8e)

- attestor-ci now also checks LICENSE.
- pages-ci now also runs site/astro.config.mjs and site/src/.
- anchor/xrpl/anchor-result.json is now written by anchor/xrpl/scripts/post-anchor.mjs.
- anchor/xrpl/partition-root.json is now written by anchor/xrpl/scripts/compute-root.mjs.
- pages/out is now written by pages/build-pages.mjs and pages/build-status.mjs.
- And 23 more new writers and readers of places.
- .github was mixed and is now authored.
- pages was mixed and is now authored.
- the repository root was mixed and is now authored.
- And 1 more origin change.
- 296 files changed content, across 17 parts.

## What comes in

1. **pages-ci.** On a push to main touching 6 paths; or by hand. Runs pages/build-metrics.mjs, pages/build-pages.mjs, pages/build-stats.mjs and 6 more.
2. **attestor-ci.** On a schedule (`0 */6 * * *`); or by hand. Runs attestor/scripts/attest-release.mjs, policy/scripts/check-policy.mjs, verifiers/license/scripts/verify-license.mjs and 2 more; checks LICENSE.
3. **registry-ci.** On a push to main touching 5 paths; or by hand. Runs registry/scripts/build-anchors.mjs, registry/scripts/build-badges.mjs, registry/scripts/build-dependencies.mjs and 4 more.
4. **anchor-xrpl.** On a schedule (`0 0 * * *`); or by hand. Runs anchor/xrpl/scripts/compute-root.mjs, anchor/xrpl/scripts/emit-anchor-event.mjs and registry/scripts/build-anchors.mjs.
5. **ledger-ci.** On a pull request touching 9 paths; or by hand. Runs ledger/scripts/validate-ledger.mjs.
6. **xrpl-watch.** On a schedule (`0 12 * * 1`), Monday at 12:00 UTC; or by hand. Runs anchor/xrpl/scripts/watch.mjs.
7. **Release.** When a release is published; or by hand. Runs packages/repomesh-cli/scripts/build.mjs and packages/repomesh-cli/tests/.
8. **repomesh-broadcast.** When a release is published; or by hand. Runs packages/repomesh-cli/scripts/build.mjs.

## What happens through attestor-ci

1. The workflow runs attestor/scripts/attest-release.mjs in attestor, policy/scripts/check-policy.mjs in policy, and verifiers/license/scripts/verify-license.mjs, verifiers/repro/scripts/verify-repro.mjs and verifiers/security/scripts/verify-security.mjs in verifiers; it checks LICENSE in the repository root.
   1. Inside attestor/scripts/attest-release.mjs, main does, in order: key window (verifiers, 4 steps).
   2. **Resolve trusted signature time sync** (verifiers) runs, in order: find earliest anchor for leaf and is bundled trusted anchor.
   3. Inside verifiers/license/scripts/verify-license.mjs, main does, in order:
      1. common (6 steps)
      2. find sbom attestation
      3. common (4 steps)
      4. load validated overrides
      5. fetch cyclone dx components bound
      6. common (4 steps)
      7. classify spdx expression
      8. common (4 steps)
   4. Inside verifiers/repro/scripts/verify-repro.mjs, main does, in order: common (22 steps).
   5. Inside verifiers/security/scripts/verify-security.mjs, main does, in order: common (6 steps), find sbom attestation, common (4 steps), fetch cyclone dx components bound and common (12 steps).
2. It writes to ledger/events/events.jsonl.
3. It commits ledger/events/events.jsonl and pushes.
4. It opens an issue when it fails.
5. It opens a pull request.

## Who reads the results

- **ledger/events/events.jsonl** is read by .github/workflows/ledger-ci.yml, .github/workflows/repomesh-broadcast.yml, anchor/xrpl/scripts/compute-root.mjs, anchor/xrpl/scripts/verify-anchor.mjs, attestor/scripts/attest-release.mjs, ledger/scripts/validate-ledger.mjs, ledger/scripts/verify-release.mjs, repomesh-cli (4 files), pages/build-status.mjs, policy/scripts/check-policy.mjs, registry (4 files) and tools/verify-release.mjs.

## The other doors

**pages-ci** runs pages/build-metrics.mjs, pages/build-pages.mjs, pages/build-stats.mjs and 6 more, reaches anchor, ledger and verifiers, writes to registry/badges/ and registry/snippets/, and deploys the site.

**registry-ci** runs registry/scripts/build-anchors.mjs, registry/scripts/build-badges.mjs, registry/scripts/build-dependencies.mjs and 4 more, reaches ledger and verifiers, writes to registry/anchors.json, registry/badges/, registry/capabilities.json, registry/dependencies.json, registry/nodes.json, registry/snippets/, registry/trust.json and registry/verifiers.json, commits registry/anchors.json, registry/badges/, registry/capabilities.json, registry/dependencies.json, registry/nodes.json, registry/snippets/, registry/trust.json and registry/verifiers.json, then pushes, and opens a pull request.

**anchor-xrpl** runs anchor/xrpl/scripts/compute-root.mjs, anchor/xrpl/scripts/emit-anchor-event.mjs and registry/scripts/build-anchors.mjs, reaches verifiers, writes to anchor/xrpl/manifests/, ledger/events/events.jsonl and registry/anchors.json, commits anchor/xrpl/manifests/*.json, ledger/events/events.jsonl and registry/anchors.json, then pushes, opens an issue when it fails, and opens a pull request.

**ledger-ci** runs ledger/scripts/validate-ledger.mjs and reaches verifiers.

**xrpl-watch** runs anchor/xrpl/scripts/watch.mjs, reaches repomesh-cli, and opens an issue.

**Release** runs packages/repomesh-cli/scripts/build.mjs and packages/repomesh-cli/tests/, and publishes to npm and a container image.

**repomesh-broadcast** runs packages/repomesh-cli/scripts/build.mjs, commits into a clone of mcp-tool-shop-org/repomesh and pushes there, and opens a pull request.

## What breaks what

- **verifiers** is imported by 5 parts (anchor, attestor, ledger, registry, tools) and sits on the path of 5 doors.
- **anchor** is imported by 2 parts (pages, tools) and sits on the path of 3 doors.
- **repomesh-cli** is imported by 2 parts (anchor, tools) and sits on the path of 3 doors.
- **ledger** is imported by 1 part (registry), and by 1 more only from tests; it sits on the path of 3 doors.
- **registry** is imported only from tests, by 1 part (tools), and sits on the path of 3 doors.
- **ledger/events/events.jsonl** is written by .github, attestor and repomesh-cli, and read by .github, anchor, attestor, ledger, pages, policy, registry, repomesh-cli and tools; a hand edit reaches every reader.
- **ledger/nodes/** is written by attestor and tools, and read by attestor, ledger, policy, registry, repomesh-cli and tools; a hand edit reaches every reader.

## What tends to change together

- **ledger/scripts/validate-ledger.mjs** and **registry/scripts/build-trust.mjs** changed together in 5 of 5 commits, and the registry part imports the ledger part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

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

- **anchor/xrpl/manifests/** is written by .github/workflows/anchor-xrpl.yml and anchor/xrpl/scripts/compute-root.mjs.
- **ledger/events/events.jsonl** is written by .github/workflows/anchor-xrpl.yml, .github/workflows/attestor-ci.yml, attestor/scripts/emit-key-event.mjs and packages/repomesh-cli/src/key/rotate-revoke.mjs.
- **ledger/nodes/** is written by attestor/scripts/emit-key-event.mjs and tools/join-node.mjs.
- **registry/anchors.json** is written by .github/workflows/anchor-xrpl.yml and .github/workflows/registry-ci.yml.
- **registry/badges/** is written by .github/workflows/registry-ci.yml and registry/scripts/build-badges.mjs.
- **registry/capabilities.json** is written by .github/workflows/registry-ci.yml and registry/scripts/build-registry.mjs.
- **registry/dependencies.json** is written by .github/workflows/registry-ci.yml and registry/scripts/build-dependencies.mjs.
- **registry/nodes.json** is written by .github/workflows/registry-ci.yml and registry/scripts/build-registry.mjs.
- **registry/snippets/** is written by .github/workflows/registry-ci.yml and registry/scripts/build-snippets.mjs.
- **registry/trust.json** is written by .github/workflows/registry-ci.yml.
- **registry/verifiers.json** is written by .github/workflows/registry-ci.yml and registry/scripts/build-verifiers.mjs.

## Hand-authored

People write .github/, assets/, docs/, profiles/, the repository root, schemas/, scripts/, site/ and templates/; 13 writes with paths built at run time may land here.

## Where to start

.github/workflows/ledger-ci.yml → ledger/scripts/validate-ledger.mjs → verifiers/lib/key-window.mjs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 103 import sites could not be resolved.
- 13 writes and 74 reads use paths built at run time and are not named here.
- 19 writes go to places this repository does not track, so they are not listed as generated.
- 29 writes and 38 reads go to the directory the command is run in or the home directory, not to this repository.
- 65 commands are built at run time and not followed, 50 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
