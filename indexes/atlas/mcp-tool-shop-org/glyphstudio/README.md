# glyphstudio: how it works

Mapped at 2026-09-24 from commit 6767835.

## What this is

15 parts, mostly TypeScript (424 files). Work enters through 3 doors; the busiest is CI, which reaches 4 parts.

## What changed since 2026-09-24 (cfb8917)

Nothing structural changed since 2026-09-24; 652 files changed content.

## What comes in

1. **CI.** On a pull request touching 8 paths; on a push to main touching 8 paths; or by hand. Runs packages/domain/src/ciGates.test.ts, packages/domain/src/shortcutManifest.test.ts, packages/domain/src/sizeProfile.test.ts and 117 more; checks packages/domain/src/, packages/mcp-sprite-server/src/ and packages/state/src/.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **Dogfood.** By hand. Runs no file this map can see.

## What happens through CI

1. The workflow runs 5 files in domain, 23 files in mcp-sprite-server, and 93 files in state; it checks packages/domain/src/ in domain, packages/mcp-sprite-server/src/ in mcp-sprite-server and packages/state/src/ in state.
2. That reaches api-contract (4 files).
3. It writes to docs/benchmark-assets/, examples/benchmark-assets/ and packages/mcp-sprite-server/fixtures/golden/.

## Who reads the results

- **docs/benchmark-assets/** has no reader in this repository.
- **examples/benchmark-assets/** has no reader in this repository.
- **packages/mcp-sprite-server/fixtures/golden/** is read by packages/mcp-sprite-server/examples/run-workflows.ts, and by 1 test.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Dogfood** runs no file this map can see and sends a dispatch to dogfood-lab/testing-os.

## What breaks what

- **domain** is imported by 4 parts (api-contract, desktop, mcp-sprite-server, state) and sits on the path of 1 door.
- **api-contract** is imported by 2 parts (desktop, state) and sits on the path of 1 door.
- **state** is imported by 2 parts (desktop, mcp-sprite-server) and sits on the path of 1 door.
- **packages/mcp-sprite-server/fixtures/golden/** is written by mcp-sprite-server and read by mcp-sprite-server; a hand edit reaches every reader.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **scripts** is imported by no test.
- **showcase** is imported by no test.

## Written but never read

- **docs/benchmark-assets/** is written by packages/mcp-sprite-server/src/dogfood/materialize.test.ts (a test) and read by nothing else in this repository.
- **docs/dogfood/character-sprite/** is written by scripts/translate-character.mjs and read by nothing else in this repository.
- **docs/dogfood/prop-sprite/** is written by scripts/translate-prop.mjs and read by nothing else in this repository.
- **docs/dogfood/stage43-creature/** is written by scripts/dogfood-43-creature.mjs and read by nothing else in this repository.
- **docs/dogfood/stage43-humanoid/** is written by scripts/dogfood-43-humanoid.mjs and read by nothing else in this repository.
- **docs/dogfood/stage43-prop/** is written by scripts/dogfood-43-prop.mjs and read by nothing else in this repository.
- **docs/dogfood/stage44-curves/** is written by scripts/dogfood-44-curves.mjs and read by nothing else in this repository.
- **docs/dogfood/stage44-quality/** is written by scripts/dogfood-44-quality.mjs and read by nothing else in this repository.

And 12 more places.

## Helpers that look duplicated

No two parts export a helper that looks alike in the files this map could read; 1 file could not be.

## Generated, never hand-edited

- **docs/benchmark-assets/** is written by packages/mcp-sprite-server/src/dogfood/materialize.test.ts (a test).
- **docs/dogfood/character-concept/** is written by scripts/dogfood-character.mjs.
- **docs/dogfood/character-sprite/** is written by scripts/translate-character.mjs.
- **docs/dogfood/prop-concept/** is written by scripts/dogfood-prop.mjs.
- **docs/dogfood/prop-sprite/** is written by scripts/translate-prop.mjs.
- **docs/dogfood/stage43-creature/** is written by scripts/dogfood-43-creature.mjs.
- **docs/dogfood/stage43-humanoid/** is written by scripts/dogfood-43-humanoid.mjs.
- **docs/dogfood/stage43-prop/** is written by scripts/dogfood-43-prop.mjs.
- **docs/dogfood/stage44-curves/** is written by scripts/dogfood-44-curves.mjs.
- **docs/dogfood/stage44-quality/** is written by scripts/dogfood-44-quality.mjs.
- **docs/dogfood/stage45-feedback/dogfood-log.md** is written by scripts/dogfood-45-feedback.mjs.
- **docs/dogfood/vector-master/** is written by scripts/dogfood-vector-master.mjs.
- **docs/showcase/stage46/** is written by scripts/showcase-46.mjs.
- **docs/showcase/stage47-ollama/** is written by scripts/dogfood-47-ollama.mjs.
- **docs/showcase/stage47a-test/** is written by scripts/test-47a-prompt.mjs.
- **docs/showcase/stage47b-critique/** is written by scripts/test-47b-critique-loop.mjs.
- **docs/visual-recovery/critiques/** is written by scripts/critique-sprite.mjs.
- **docs/visual-recovery/hero-sprite/hero-500.png** is written by scripts/hero-sprite.mjs.
- **docs/visual-recovery/hero-sprite/hero-silhouette-500.png** is written by scripts/hero-sprite.mjs.
- **examples/benchmark-assets/** is written by packages/mcp-sprite-server/src/dogfood/materialize.test.ts (a test).
- **packages/mcp-sprite-server/fixtures/golden/** is written by packages/mcp-sprite-server/src/workflows/verify.ts.
- **showcase/** is written by showcase/generate.mjs.
- **showcase/previews/** is written by showcase/render-previews.mjs.

## Hand-authored

People write .github/, assets/, audit/, dogfood/, the repository root and site/. Nothing in the files this map could read writes to them; 1 file could not be.

## Where to start

.github/workflows/ci.yml → packages/state/src/index.ts → packages/domain/src/index.ts

Read those in order to follow one pull request end to end.

## What this map cannot see

- 17 import sites could not be resolved.
- 1 file uses syntax the parser cannot read (apps/desktop/src/components/VectorReductionPanel.tsx), so what it imports is not known: a bare `&` in JSX text (1).
- 2 reads use paths built at run time and are not named here.
- 4 writes and 24 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
