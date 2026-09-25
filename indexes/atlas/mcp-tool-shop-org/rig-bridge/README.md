# rig-bridge: how it works

Mapped at 2026-09-25 from commit 204828b.

## What this is

6 parts, mostly TypeScript (48 files) and JavaScript (1). Work enters through 4 doors; ci, Deploy site to GitHub Pages, Release and rig-bridge each reach 1 part, and ci is followed because a pull request goes through it. It publishes to npm. People run rig-bridge.

## What changed since 2026-09-24 (e91f65b)

Nothing structural changed since 2026-09-24; 87 files changed content.

## What comes in

1. **ci.** On a pull request touching 11 paths; on a push touching 11 paths; or by hand. Runs src/cli.ts, src/cli-e2e.test.ts, src/cli.test.ts and 22 more; checks src/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **Release.** When a tag matching `v[0-9]+.[0-9]+.[0-9]+` or `v[0-9]+.[0-9]+.[0-9]+-*` is pushed. Runs src/cli.ts, src/cli-e2e.test.ts, src/cli.test.ts and 22 more; checks src/.
4. **rig-bridge** (a command people run). Runs src/cli.ts.

## What happens through ci

1. The workflow runs 25 files in src; it checks src/ in src.
   1. Inside src/cli.ts, main does, in order:
      1. run init
      2. run new
      3. run send
      4. run close
      5. run status
      6. run thread
      7. run sync
      8. run relay
   2. **Run init** runs, in order: normalize rig id, validate rig id, is git repo, repo root, write config and config path.
   3. **Run new** runs, in order: repo root, read config and render envelope.
   4. **Run send** runs, in order:
      1. validate rig id
      2. repo root
      3. read config
      4. marker to status class
      5. body hash
      6. validate frontmatter
      7. render envelope
      8. safe commit
      9. safe push
   5. **Run close** runs, in order:
      1. repo root
      2. read config
      3. marker to status class
      4. find peer rigs
      5. body hash
      6. validate frontmatter
      7. render envelope
      8. safe commit
      9. safe push
   6. **Run relay** runs, in order:
      1. repo root
      2. read config
      3. run git
      4. validate rig id
      5. parse envelope
      6. normalize rig id
      7. validate rig id
      8. body hash
      9. validate frontmatter
      10. render envelope
      11. run git
2. It runs git.

## Who reads the results

ci writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Release** runs src/cli.ts, src/cli-e2e.test.ts, src/cli.test.ts and 22 more, checks src/, runs git, publishes to npm, and creates a GitHub release.

**rig-bridge** (a command people run) runs src/cli.ts and runs git.

## What breaks what

- **src** is imported by no other part and sits on the path of 3 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, docs/, the repository root, schemas/ and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → src/cli.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 9 writes and 46 reads go to a path their caller passes, not to this repository.
- 2 commands are built at run time and not followed.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
