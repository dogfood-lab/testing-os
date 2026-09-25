# sovereignty: how it works

Mapped at 2026-09-25 from commit 8bed6b6.

## What this is

12 parts, mostly Python (109 files), TypeScript (60), JavaScript (19) and Rust (6). Work enters through 5 doors; the busiest is CI, which reaches 10 parts. It publishes to PyPI. People run sov. sov-tauri-shell is a desktop app built from app/src-tauri (nothing ships it).

## What changed since 2026-09-25 (41fa408)

Nothing structural changed since 2026-09-25; 2 files changed content.

## What comes in

1. **CI.** On a pull request; on a push touching 12 paths; on a schedule (`0 14 * * *`); or by hand. Except on a schedule, it runs .github/scripts/check-publish-yml.py, scripts/check-theme-tokens.sh, scripts/check-voice.sh and 134 more; checks .pip-audit-ignore, sov_cli/, sov_daemon/ and 28 more.
2. **Release.** When a release is published; or by hand. Runs .github/scripts/generate-latest-json.py, .github/scripts/stage-tauri-artifacts.sh and sov_cli/main.py; builds sov_cli/__main__.py; checks sov_cli/, sov_engine/ and sov_transport/.
3. **Deploy site to GitHub Pages.** On a pull request touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **sov** (a command people run). Runs sov_cli/main.py.
5. **sov-tauri-shell** (a desktop app built from app/src-tauri, which nothing ships). Runs app/src-tauri/src/main.rs.

## What happens through CI

1. Except on a schedule, it runs .github/scripts/check-publish-yml.py, scripts/check-theme-tokens.sh, scripts/check-voice.sh and 134 more; checks .pip-audit-ignore, sov_cli/, sov_daemon/ and 28 more.
2. It writes to .sov/games/ and app/src-tauri/gen/schemas, which are not tracked.

## Who reads the results

CI writes only to .sov/games/ and app/src-tauri/gen/schemas, which are not tracked.

## The other doors

**Release** runs .github/scripts/generate-latest-json.py, .github/scripts/stage-tauri-artifacts.sh and sov_cli/main.py, checks sov_cli/, sov_engine/ and sov_transport/, reaches sov_daemon, writes to .sov/games/, which is not tracked, publishes to PyPI, and builds sov_cli/__main__.py into binaries for darwin-arm64, linux-x64 and win-x64 and uploads them to the release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site except on a pull request.

**sov** (a command people run) runs sov_cli/main.py, reaches sov_daemon, sov_engine and sov_transport, and writes to .sov/games/, which is not tracked.

**sov-tauri-shell** (a desktop app built from app/src-tauri, which nothing ships) runs app/src-tauri/src/main.rs.

## What breaks what

- **sov_engine** is imported by 3 parts (assets, sov_cli, sov_daemon), and by 1 more only from tests; it sits on the path of 3 doors.
- **sov_transport** is imported by 3 parts (sov_cli, sov_daemon, sov_engine), and by 1 more only from tests; it sits on the path of 3 doors.
- **sov_cli** is imported by 2 parts (sov_daemon, sov_engine), and by 1 more only from tests; it sits on the path of 3 doors.
- **sov_daemon** is imported by 1 part (sov_cli), and by 1 more only from tests; it sits on the path of 3 doors.
- **.github** is imported by no other part and sits on the path of 2 doors.
- **app** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **sov_engine/hashing.py** and **tests/test_proofs.py** changed together in 6 of 8 commits, and the tests part imports the sov_engine part.
- **sov_transport/base.py** and **sov_transport/xrpl_testnet.py** changed together in 4 of 6 commits, inside the sov_transport part.
- **sov_cli/errors.py** and **sov_cli/main.py** changed together in 10 of 19 commits, inside the sov_cli part.
- **sov_cli/errors.py** and **sov_transport/xrpl_testnet.py** changed together in 5 of 10 commits, and the sov_cli part imports the sov_transport part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 3 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **assets** is imported by no test.

## Written but never read

- **assets/print/source/print-bundle.js** is written by assets/print/source/compile-jsx.mjs and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **assets/print/source/print-bundle.js** is written by assets/print/source/compile-jsx.mjs.

## Hand-authored

People write .github/, docs/, the repository root and site/; 3 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → .github/scripts/check-publish-yml.py

Read those in order to follow one pull request end to end.

## What this map cannot see

- 27 import sites could not be resolved.
- 3 writes and 49 reads use paths built at run time and are not named here.
- 2 writes go to places this repository does not track, so they are not listed as generated.
- 7 reads go to a path their caller passes, not to this repository.
- 1 command is built at run time and not followed.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
