# ai-eyes-mcp: how it works

Mapped at 2026-09-26 from commit 4fba7a2 by Atlas 1.23.0.

## What this is

6 parts, mostly Python (11 files), CSS (2), TypeScript (2), Astro (1), JavaScript (1) and shell (1). Work enters through 3 doors; the busiest is CI, which reaches 2 parts. It deploys a site to GitHub Pages. People run ai-eyes-mcp.

## What changed since 2026-09-25 (f8d83a6)

- CI now also runs src/ai_eyes_mcp/__init__.py, src/ai_eyes_mcp/engine.py and src/ai_eyes_mcp/server.py.
- No file changed.

## What comes in

1. **CI.** On a pull request touching 6 paths; on a push touching 6 paths; or by hand. Runs src/ai_eyes_mcp/__init__.py, src/ai_eyes_mcp/engine.py, src/ai_eyes_mcp/server.py and 7 more.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **ai-eyes-mcp** (a command people run). Runs src/ai_eyes_mcp/server.py.

## What happens through CI

1. The workflow runs src/ai_eyes_mcp/__init__.py, src/ai_eyes_mcp/engine.py and src/ai_eyes_mcp/server.py in src and tests/ in tests.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**ai-eyes-mcp** (a command people run) runs src/ai_eyes_mcp/server.py.

## What breaks what

- **src** is imported only from tests, by 1 part (tests), and sits on the path of 2 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since 3 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

verify.sh runs in no workflow.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, docs/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

.github/workflows/ci.yml → src/ai_eyes_mcp/server.py → src/ai_eyes_mcp/engine.py

Read those in order to follow one pull request end to end.

## What this map cannot see

- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
