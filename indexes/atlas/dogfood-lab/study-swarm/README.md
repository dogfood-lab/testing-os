# study-swarm: how it works

Mapped at 2026-09-25 from commit ab907f0.

## What this is

7 parts, in JavaScript (3 files), CSS (2 files), TypeScript (2 files) and Astro (1 file). Work enters through 4 doors; CI and Release each reach 2 parts, and CI is followed because a pull request goes through it. It publishes to npm. It deploys a site to GitHub Pages. People run study-swarm.

## What changed since 2026-09-25 (d537ad2)

Nothing structural changed since 2026-09-25; no file changed.

## What comes in

1. **CI.** On a pull request touching 7 paths; on a push to main touching 7 paths; or by hand. Runs bin/study-swarm.mjs and scripts/smoke.mjs.
2. **Release.** When a tag matching `v*` is pushed. Runs bin/study-swarm.mjs and scripts/smoke.mjs.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **study-swarm** (a command people run). Runs bin/study-swarm.mjs.

## What happens through CI

1. The workflow runs bin/study-swarm.mjs in bin and scripts/smoke.mjs in scripts.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs bin/study-swarm.mjs and scripts/smoke.mjs, and publishes to npm.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**study-swarm** (a command people run) runs bin/study-swarm.mjs.

## What breaks what

- **bin** is run as a child process by 1 part (scripts) and sits on the path of 3 doors.
- **scripts** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **bin/study-swarm.mjs** and **scripts/smoke.mjs** changed together in 9 of 11 commits, though neither part imports the other.

Confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

No test files were found by name.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, assets/, examples/, the repository root and site/; 6 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → bin/study-swarm.mjs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 6 writes and 31 reads use paths built at run time and are not named here.
- 110 writes and 20 reads go to a temporary directory, not to this repository.
- 1 write and 12 reads go to a path their caller passes, not to this repository.
- 2 reads go to the directory the command is run in or a path their caller passes, not to this repository.
- 2 reads go to the directory the command is run in, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
