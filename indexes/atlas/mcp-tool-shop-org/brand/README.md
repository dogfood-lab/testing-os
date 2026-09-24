# brand: how it works

Mapped at 2026-09-24 from commit 49c1e9d.

## What this is

11 parts, mostly TypeScript (40 files). Work enters through 5 doors; the busiest is CI, which reaches 4 parts. It publishes to npm. People run brand.

## What changed since 2026-09-23 (82d3e54)

- CI's pull request trigger now also names `atlas/**`.
- CI's push trigger now also names `atlas/**`.
- CI now also runs src/cli.ts.
- And 1 more change to a door.
- README.ja.md is now read by tests/migrate.test.ts.
- README.md is now also read by tests/audit.test.ts, tests/json-output.test.ts, tests/migrate-journal.test.ts and tests/migrate.test.ts.
- README.zh.md is now read by tests/migrate.test.ts.
- And 4 more new writers and readers of places.
- 100 files changed content, across 8 parts.

## What comes in

1. **CI.** On a pull request touching 16 paths; on a push touching 16 paths; or by hand. Runs scripts/check-audit-allowlist.mjs, src/cli.ts, tests/add-gallery.test.ts and 18 more; checks src/.
2. **Release.** When a tag matching `v*` is pushed; or by hand. Runs tests/add-gallery.test.ts, tests/add-model.test.ts, tests/audit.test.ts and 16 more; checks src/.
3. **Deploy site to GitHub Pages.** On a pull request touching 8 paths; on a push to main touching 8 paths; or by hand. Runs site/astro.config.mjs and site/src/; checks src/.
4. **Sync org logos.** On a schedule (`0 6 * * *`); or by hand. Runs scripts/sync-org-logos.sh and src/cli.ts; checks src/.
5. **brand** (a command people run). Runs src/cli.ts.

## What happens through CI

1. The workflow runs scripts/check-audit-allowlist.mjs in scripts, src/cli.ts in src, and 19 files in tests; it checks src/ in src.
2. That reaches the site (1 file).

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs tests/add-gallery.test.ts, tests/add-model.test.ts, tests/audit.test.ts and 16 more, checks src/, reaches the site, publishes to npm, and creates a GitHub release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, checks src/, and deploys the site on a push to main.

**Sync org logos** runs scripts/sync-org-logos.sh and src/cli.ts, checks src/, writes to logos/ and manifest.json, commits logos/ and manifest.json, then pushes to a branch for review, never to main, opens an issue, and opens a pull request.

**brand** (a command people run) runs src/cli.ts.

## What breaks what

- **src** is imported by 1 part (the site), and by 1 more only from tests; it sits on the path of 5 doors.
- **the site** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.
- **scripts** is imported by no other part and sits on the path of 2 doors.
- **tests** is imported by no other part and sits on the path of 2 doors.
- **logos/** is written by .github and read by the site and src; a hand edit reaches every reader.
- **manifest.json** is written by .github and read by .github, the site and src; a hand edit reaches every reader.

## What tends to change together

No two source files, other than a file and its own test, changed together often enough to name.

2 files changed together with their own tests, as expected.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **scripts** is imported by no test.

## Written but never read

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .claude/, .githooks/, .github/, assets/, docs/ and site/; 18 writes with paths built at run time may land here.

- **logos/** is written by .github/workflows/sync.yml, and by people: 67 of its 68 commits in the window are theirs.
- **manifest.json** is written by .github/workflows/sync.yml, and by people: 41 of its 42 commits in the window are theirs.

## Where to start

.github/workflows/ci.yml → src/cli.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 1 file uses syntax the parser cannot read (tests/manifest.test.ts), so what it imports is not known: a NUL character inside a string (1).
- 18 writes and 32 reads use paths built at run time and are not named here.
- 3 writes and 42 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 8 commands are built at run time and not followed, 6 of them in tests.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
