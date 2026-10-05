# mcp-voice-soundboard: how it works

Mapped at 2026-10-05 from commit 86fe513 by Atlas 1.26.0.

## What this is

14 parts, mostly Python (209 files), TypeScript (89), CSS (2), Astro (1) and JavaScript (1). Work enters through 9 doors; CI, Publish to GHCR, Publish to npm, @mcptoolshop/voice-soundboard-mcp and voice-soundboard-mcp each reach 2 parts, and CI is followed because a pull request goes through it. It publishes to PyPI, @mcptoolshop/voice-soundboard-core (packages/core) and @mcptoolshop/voice-soundboard-mcp (packages/mcp-server) to npm, and a container image. It deploys a site to GitHub Pages. People run voice-soundboard and voice-soundboard-mcp. People import @mcptoolshop/voice-soundboard-core and @mcptoolshop/voice-soundboard-mcp.

## What changed since 2026-10-01 (6cba5e4)

Nothing structural changed since 2026-10-01; 1 file changed content.

## What comes in

1. **CI.** On a pull request to main; on a push to main touching 7 paths; or by hand. Runs packages/core/tests/, packages/mcp-server/tests/abuse.test.ts, packages/mcp-server/tests/backend-http.test.ts and 7 more; builds packages/core/src/ and packages/mcp-server/src/.
2. **Publish to GHCR.** When a release is published; or by hand. Runs voice_soundboard/adapters/cli.py; packs LICENSE, README.md, pyproject.toml and 151 more into an image.
3. **Publish to npm.** When a release is published; or by hand. Builds packages/core/src/ and packages/mcp-server/src/.
4. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
5. **Release to PyPI.** When a release is published; or by hand. Checks voice_soundboard/.
6. **@mcptoolshop/voice-soundboard-mcp** (the package people import). Loads packages/mcp-server/src/index.ts.
7. **voice-soundboard-mcp** (a command people run). Runs packages/mcp-server/src/cli.ts.
8. **@mcptoolshop/voice-soundboard-core** (the package people import). Loads packages/core/src/index.ts.
9. **voice-soundboard** (a command people run). Runs voice_soundboard/adapters/cli.py.

## What happens through CI

1. The workflow runs packages/core/tests/ in core and 9 files in mcp-server; it builds packages/core/src/ in core and packages/mcp-server/src/ in mcp-server.
2. It uploads coverage to Codecov.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Publish to GHCR** runs voice_soundboard/adapters/cli.py, packs LICENSE, README.md, pyproject.toml and 151 more into an image, and publishes a container image.

**Publish to npm** builds packages/core/src/ and packages/mcp-server/src/, and publishes @mcptoolshop/voice-soundboard-core (packages/core) and @mcptoolshop/voice-soundboard-mcp (packages/mcp-server) to npm.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Release to PyPI** checks voice_soundboard/ and publishes to PyPI.

**@mcptoolshop/voice-soundboard-mcp** (the package people import) loads packages/mcp-server/src/index.ts and reaches core.

**voice-soundboard-mcp** (a command people run) runs packages/mcp-server/src/cli.ts and reaches core.

**@mcptoolshop/voice-soundboard-core** (the package people import) loads packages/core/src/index.ts.

**voice-soundboard** (a command people run) runs voice_soundboard/adapters/cli.py.

## What breaks what

- **core** is imported by 1 part (mcp-server) and sits on the path of 5 doors.
- **voice_soundboard** is imported by 1 part (backend-python), and by 1 more only from tests; it sits on the path of 3 doors.
- **mcp-server** is imported by no other part and sits on the path of 4 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **backend-python** is imported by no test.
- **tools** is imported by no test.

45 test files run in no workflow: tests/registrum/test_accessibility.py, tests/registrum/test_attestation.py, tests/registrum/test_latency.py and 42 more.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **main** is exported by packages/backend-python/soundboard_bridge/__main__.py (backend-python) and packages/mcp-server/backend-python/soundboard_bridge/__main__.py (mcp-server); the two look alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .claude-plugin/, .github/, assets/, docs/, the repository root, scripts/, site/ and skills/; 6 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → packages/core/src/index.ts → packages/core/src/errors.ts → packages/core/src/schemas.ts → packages/core/src/voices.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 5 import sites name declared dependencies that share their names with local modules (elevenlabs and openai); they are read as the dependencies, which are not in this repository.
- 16 imports could not be resolved: `voice_soundboard/accessibility/screen_readers/detection.py` imports a path built at run time; `voice_soundboard/engine/backends/azure.py` imports `azure.cognitiveservices.speech`, which is no module on its import path and no declared dependency, twice; and 13 more.
- 6 writes and 6 reads use paths built at run time and are not named here.
- 9 writes and 84 reads go to a path their caller passes, not to this repository.
- 3 writes go to a temporary directory, not to this repository.
- 1 write goes to the home directory (.cache/), not to this repository.
- 1 command is built at run time and not followed.
- There is a fly.toml that no workflow runs; what deploys from it does so from outside this repository, and is not on this page.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
