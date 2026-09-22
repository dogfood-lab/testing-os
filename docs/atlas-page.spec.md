# Atlas: the page specification

**Status:** approved by the Director 2026-09-22. This document is the specification for what Atlas produces. Where `docs/atlas.dispatch.md` or `docs/atlas-design.dispatch.md` conflict with it, this document wins. The two dispatches remain the record of how the engine reads a repository; they no longer define the output.

**The rule this replaces.** Atlas does not ask a person to describe a repository. It reads what the repository does and writes the description itself. A person may correct a sentence; a person is never handed a form.

## The page

The page below was written by hand for this repository, from facts traced in its own workflows, code and configuration. It is the target output: Atlas must be able to produce this page, for this repository, from the repository alone. Every sentence must trace to a fact the engine recorded.

---

# testing-os: how it works

## What this is
testing-os collects proof that other repositories' tests ran, checks that proof against each repository's rules, keeps it as a permanent record, and shows the results on a dashboard and on badges. It also carries two tools that work on repositories: the swarm, which runs an AI health pass, and Atlas, which maps how a repository works.

## What comes in
1. **A consumer's test verdict.** A repository that adopted dogfood runs its tests in CI, builds a submission, and sends it here with a token. It arrives as a repository_dispatch event and starts the ingest workflow.
2. **This repository's own verdict.** When CI finishes on main, the self-dogfood workflow builds a submission from that result and sends it through the same door. It skips commits that ingest itself made, so it cannot loop.
3. **A version tag.** Pushing a v1.x.y tag starts the release.
4. **Monday, 06:00 UTC.** The Atlas render job wakes on its own.
5. **A push or pull request** on code, docs, site, scripts, policies or fixtures starts CI.

## What happens to a submission
This is the main flow. Everything else serves it.

1. The ingest workflow builds the repository and hands the submission to the ingest runner.
2. The runner reads the global policy and that repository's own policy.
3. It fetches the scenarios the consumer declared, at the exact commit the submission names.
4. The verifier checks, in order: the submission is bound to the right repository, matches the schema, uses a supported contract version, has confirmed provenance, ran the required steps, and satisfies the policy.
5. The result is accepted or rejected. Both are kept.
6. A record is written: accepted ones under records/<org>/<repo>/<date>/, rejected ones under records/_rejected/. Each record carries the digest of the record before it, so the whole history is a hash chain that can be checked offline.
7. The indexes are rebuilt from every record: latest-by-repo, failing, stale.
8. The portfolio generator reads the indexes and writes trends and one badge per repository.
9. A bot commits the new record and the indexes back to main.

## Who reads the results
- **The dashboard** on GitHub Pages fetches the indexes from main, plus the latest roadmap.
- **Badges** in consumers' READMEs point shields.io at the badge files in the indexes.
- **A consumer's own report --status** reads the latest index and then its own record.
- **Other tools** read the same files by raw URL. The paths are a public contract.

## The two other flows
**Swarm.** Runs locally. A SQLite control plane, ignored by git, holds runs, waves, findings, receipts and adjudications. When a run finishes it builds a submission and puts it through the same ingest runner locally, then compiles a roadmap under dogfood/roadmap/.

**Atlas.** Weekly. Lists the public repositories of both orgs, clones each one that has a boundaries file, maps it, and writes the results to the atlas-render branch. The dashboard's fleet panel reads that branch.

## Release
A tag push checks that the tag matches every package's version, runs the full verify gate, publishes every package not marked private to npm with provenance, and creates the GitHub release from the matching CHANGELOG section.

## What breaks what
- **schemas** define every record, submission, finding and policy. Seven parts import it. A schema change is a contract change for every consumer.
- **verify** decides what counts as acceptable evidence. A change here changes the verdict for every consumer at once.
- **ingest's persist step** owns where records land and the hash chain. An altered record fails chain verification.
- **policies** decide who is accepted. A malformed policy is caught by the lint in the verify gate.
- **indexes** are read by everyone. A hand edit lies to every reader until the next ingest overwrites it.
- **workflows** are the doors. A broken ingest workflow means nothing arrives. A broken release workflow means nothing publishes.

## Generated, never hand-edited
records/, indexes/ (except the Atlas exclude list), reports/, dogfood/roadmap/, the Atlas map and renders, the README version block.

## Hand-authored
policies/, fixtures/, dogfood/scenarios/, the Atlas boundaries file, docs/, the swarm protocol and templates.

## Where to start
To follow one submission end to end, read in this order:
examples/dogfood.yml → .github/workflows/ingest.yml → packages/ingest/run.js → packages/verify/index.js → packages/ingest/persist.js → indexes/latest-by-repo.json → site/public/dashboard/index.html

## Where the docs and the code disagree
Found while tracing. The code is what runs.
1. CLAUDE.md and the release workflow say six packages publish. Seven do: Atlas is not marked private, so the next tag publishes it.
2. CLAUDE.md says self-dogfood sends with DOGFOOD_TOKEN. It uses the workflow's own token.
3. The portfolio generator's help text says trends and badges are git-ignored. They are committed.
4. A comment in the swarm database code says ingest commits the control-plane database to main. It does not.
5. CI does not run the Atlas check. Only the local verify gate does, and the atlas directory is not in CI's path filter.

---

## Where each section comes from

| Section | Facts it needs | Engine status |
|---|---|---|
| What comes in | Workflow triggers (events, path filters, schedules, dispatch types); package binaries | Binaries recorded. Workflows not read. |
| What happens to a submission | For each door: the commands its steps run, the tracked files those commands name, the import closure from those files in the order reached | Import closure exists per file. Door-to-file and reach-order not recorded. |
| Who reads the results | Code and site pages that fetch or read tracked paths, by literal path or raw URL | Not recorded. |
| The two other flows | Same as the two above, for doors other than the main one | Same. |
| Release | The release door's checks, publish step, and which packages are not marked private | Not recorded. |
| What breaks what | Import fan-in per part (recorded); which doors pass through each part; role | Fan-in recorded. Door coverage not recorded. |
| Generated, never hand-edited | Paths that code or workflows write (git add in a workflow; write calls naming a tracked directory in code) | Not recorded. |
| Hand-authored | Tracked directories with no writer | Follows from the above. |
| Where to start | The file chain along the door with the greatest reach | Follows from reach order. |
| Where the docs and the code disagree | Prose claims that name a countable or checkable fact, checked against the recorded facts | Not in scope yet. Recorded here so it is not forgotten. |

## Build order

1. **Doors and reach.** Read the workflows. Record each door: trigger, commands, tracked files named, secrets named, dispatches sent. Record, per door, the boundaries reached through the import closure in the order they are reached.
2. **Landing places and readers.** Record what each door and each file writes to, and who reads those places.
3. **The page.** Replace the three renders and the acceptance ladder with this page, generated from the recorded facts. The boundary file keeps names and globs only.
4. **The surfaces.** One page per repository on the site, then the fleet.

## The main flow

A repository has one main flow: the door whose reach covers the most parts. On this repository that is the ingest door. The page leads with it. The others follow in order of reach.
