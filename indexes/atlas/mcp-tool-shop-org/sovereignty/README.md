# sovereignty: how it works

Mapped at 2026-09-25 from commit 8bed6b6.

## What this is

12 parts, mostly Python (109 files), TypeScript (60), JavaScript (19) and Rust (6). Work enters through 5 doors; the busiest is CI, which reaches 10 parts. It publishes to PyPI. People run sov. sov-tauri-shell is a desktop app built from app/src-tauri (nothing ships it).

## What changed since 2026-09-25 (41fa408)

- CI now also runs sov_daemon/__init__.py.
- Release now also runs sov_daemon/__init__.py.
- assets/print/source/fonts.css is now read by assets/print/source/Board A - Parchment Heritage.html, assets/print/source/Sovereignty Print Pack - print.html and assets/print/source/Sovereignty Print Pack.html.
- assets/print/source/print-bundle.js is now also read by assets/print/source/Board A - Parchment Heritage.html, assets/print/source/Sovereignty Print Pack - print.html and assets/print/source/Sovereignty Print Pack.html.
- assets/print/source/print-entry.js is now read by assets/print/source/Sovereignty Print Pack - print.html.
- And 4 more new writers and readers of places.
- 2 files changed content, across 2 parts.

## What comes in

1. **CI.** On a pull request; on a push touching 12 paths; on a schedule (`0 14 * * *`); or by hand. On a schedule or by hand, it runs sov_daemon/__init__.py. Except on a schedule, it runs .github/scripts/check-publish-yml.py, scripts/check-theme-tokens.sh, scripts/check-voice.sh and 134 more; checks .pip-audit-ignore, sov_cli/, sov_daemon/ and 28 more.
2. **Release.** When a release is published; or by hand. Runs .github/scripts/generate-latest-json.py, .github/scripts/stage-tauri-artifacts.sh, sov_cli/main.py and 1 more; builds sov_cli/__main__.py; checks sov_cli/, sov_engine/ and sov_transport/.
3. **Deploy site to GitHub Pages.** On a pull request touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **sov** (a command people run). Runs sov_cli/main.py.
5. **sov-tauri-shell** (a desktop app built from app/src-tauri, which nothing ships). Runs app/src-tauri/src/main.rs.

## What happens through CI

1. On a schedule or by hand, it runs sov_daemon/__init__.py.
2. Except on a schedule, it runs .github/scripts/check-publish-yml.py, scripts/check-theme-tokens.sh, scripts/check-voice.sh and 134 more; checks .pip-audit-ignore, sov_cli/, sov_daemon/ and 28 more.
3. It writes to app/src-tauri/gen/schemas, which is not tracked.

## Who reads the results

CI writes only to app/src-tauri/gen/schemas, which is not tracked.

## The other doors

**Release** runs .github/scripts/generate-latest-json.py, .github/scripts/stage-tauri-artifacts.sh, sov_cli/main.py and 1 more, checks sov_cli/, sov_engine/ and sov_transport/, publishes to PyPI, and builds sov_cli/__main__.py into binaries for darwin-arm64, linux-x64 and win-x64 and uploads them to the release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on a push to main or by hand.

**sov** (a command people run) runs sov_cli/main.py and reaches sov_daemon, sov_engine and sov_transport.

**sov-tauri-shell** (a desktop app built from app/src-tauri, which nothing ships) runs app/src-tauri/src/main.rs.

## What breaks what

- **sov_engine** is imported by 3 parts (assets, sov_cli, sov_daemon), and by 1 more only from tests; it sits on the path of 3 doors.
- **sov_transport** is imported by 3 parts (sov_cli, sov_daemon, sov_engine), and by 1 more only from tests; it sits on the path of 3 doors.
- **sov_cli** is imported by 2 parts (sov_daemon, sov_engine), and by 1 more only from tests; it sits on the path of 3 doors.
- **sov_daemon** is imported by 1 part (sov_cli), and by 1 more only from tests; it sits on the path of 3 doors.
- **.github** is imported by no other part and sits on the path of 2 doors.
- **app** is imported by no other part and sits on the path of 2 doors.
- **assets/print/source/print-bundle.js** is written by assets and read by assets; a hand edit reaches every reader.

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

Every written place has a reader.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **assets/print/source/print-bundle.js** is written by assets/print/source/compile-jsx.mjs.

## Hand-authored

People write .github/, docs/, the repository root and site/; 3 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → sov_daemon/__init__.py → sov_daemon/lifecycle.py → sov_engine/io_utils.py → sov_engine/schemas.py → sov_engine/proof.py

Read those in order to follow one pull request end to end.

## What this map cannot see

- 24 import sites name a declared dependency that shares its name with a local module (xrpl); they are read as the dependency, which is not in this repository.
- 3 imports could not be resolved: `assets/print/source/render.mjs` imports `puppeteer-core`, which is not declared; `assets/print/source/vendor/react-dom.production.min.js` imports `react`, which is not declared; `sov_cli/main.py` imports a path built at run time.
- 3 writes and 49 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 7 reads go to a path their caller passes, not to this repository.
- 1 write and 2 reads go to the directory the command is run in (.sov/, README.md and docs/), not to this repository.
- 1 command is built at run time and not followed.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
