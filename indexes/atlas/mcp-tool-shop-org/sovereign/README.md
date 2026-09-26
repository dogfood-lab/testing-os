# sovereign: how it works

Mapped at 2026-09-26 from commit b5f1ba5 by Atlas 1.23.0.

## What this is

8 parts, mostly JavaScript (52 files), HTML (39), CSS (2), TypeScript (2), Astro (1) and shell (1). Work enters through 5 doors; CI and Release each reach 3 parts, and CI is followed because a pull request goes through it. It publishes to npm. It deploys a site to GitHub Pages. People run sovereign. People import @mcptoolshop/sovereign.

## What changed since 2026-09-25 (87de092)

- test now imports tools.
- No file changed.

## What comes in

1. **CI.** On a pull request to main touching 7 paths; on a push to main touching 7 paths; or by hand. Runs bin/sovereign.js, test/determinism.test.mjs, test/playability.test.mjs and 1 more.
2. **Release.** When a tag matching `v*` is pushed. Runs bin/sovereign.js, test/determinism.test.mjs, test/playability.test.mjs and 1 more.
3. **Deploy GitHub Pages.** On a push to main; or by hand. Runs site/astro.config.mjs and site/src/.
4. **@mcptoolshop/sovereign** (the package people import). Loads bin/sovereign.js.
5. **sovereign** (a command people run). Runs bin/sovereign.js.

## What happens through CI

1. The workflow runs bin/sovereign.js in bin and test/determinism.test.mjs, test/playability.test.mjs and test/smoke.test.mjs in test.
2. That reaches tools (1 file).

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs bin/sovereign.js, test/determinism.test.mjs, test/playability.test.mjs and 1 more, reaches tools, publishes to npm, and creates a GitHub release.

**Deploy GitHub Pages** runs site/astro.config.mjs and site/src/, writes to site/dist, which is not tracked, and deploys the site.

**@mcptoolshop/sovereign** (the package people import) loads bin/sovereign.js.

**sovereign** (a command people run) runs bin/sovereign.js.

## What breaks what

- **bin** is imported by no other part and sits on the path of 4 doors.
- **tools** is imported only from tests, by 1 part (test), and sits on the path of 2 doors.
- **test** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 0 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is touched by at least one test.

bin is touched by tests only through a spawn: a test runs its files as a child process.

verify.sh runs in no workflow.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, experiments/, release/, the repository root and site/; 10 writes with paths built at run time may land here.

## Where to start

Start at bin/sovereign.js to follow one run of sovereign end to end. This path follows sovereign (a command people run) from its entry, since CI runs only tests and scripts that import no code here.

## What this map cannot see

- 10 writes and 9 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 1 read goes to a path its caller passes, not to this repository.
- 1 command is built at run time and not followed.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
