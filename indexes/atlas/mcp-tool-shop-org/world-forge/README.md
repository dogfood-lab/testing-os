# world-forge: how it works

Mapped at 2026-09-24 from commit 333532b.

## What this is

15 parts, mostly TypeScript (497 files). Work enters through 6 doors; the busiest is CI, which reaches 11 parts. People run world-forge-export, world-forge-export-godot and world-forge-export-unreal.

## What changed since 2026-09-23 (b6fa56a)

- site no longer imports the repository root.
- CI now also runs dogfood/__tests__/, packages/editor/src/__tests__/, packages/editor/src/kits/bundle-migrate.test.ts and 58 more.
- Deploy site to GitHub Pages now also runs site/astro.config.mjs and site/src/.
- Release now also runs dogfood/__tests__/, packages/editor/src/__tests__/, packages/editor/src/kits/bundle-migrate.test.ts and 56 more.
- And 3 more changes to doors.
- docs/c0-alignment/export-table.json is now written by packages/export-ai-rpg/src/__tests__/c0-export-table.test.ts.
- docs/c0-alignment/export-table.md is now written by packages/export-ai-rpg/src/__tests__/c0-export-table.test.ts.
- docs/c0-alignment/fixture-manifest.json is now written by packages/export-ai-rpg/src/__tests__/c0-export-table.test.ts.
- And 89 more new writers and readers of places.
- docs was authored and is now mixed.
- 633 files changed content, across 14 parts.

## What comes in

1. **CI.** On a pull request; on a push; or by hand. Runs scripts/check-pack.mjs, scripts/sync-version.mjs, dogfood/__tests__/ and 211 more; checks dogfood/, e2e/, packages/editor/src/ and 222 more.
2. **Release.** When a release is published. Runs scripts/sync-version.mjs, dogfood/__tests__/, packages/editor/src/__tests__/ and 117 more; checks dogfood/, e2e/, packages/editor/src/ and 222 more.
3. **Deploy site to GitHub Pages.** On a push to main touching 3 paths; when a release is published; or by hand. Except on a release event, it runs site/astro.config.mjs and site/src/.
4. **world-forge-export** (a command people run). Runs packages/export-ai-rpg/src/cli.ts.
5. **world-forge-export-godot** (a command people run). Runs packages/export-godot/src/cli.ts.
6. **world-forge-export-unreal** (a command people run). Runs packages/export-unreal/src/cli.ts.

## What happens through CI

1. The workflow runs scripts/check-pack.mjs and scripts/sync-version.mjs in scripts, dogfood/__tests__/ in dogfood, 112 files in editor, 22 files in export-ai-rpg, packages/export-godot/src/__tests__/ in export-godot, and 50 files in 4 more parts; it checks dogfood/ in dogfood, e2e/ in e2e, packages/editor/src/ in editor, packages/export-ai-rpg/src/ in export-ai-rpg, packages/export-godot/src/ in export-godot, and 108 files in 3 more parts.
2. That reaches the repository root (1 file).
3. It writes to docs/c0-alignment/export-table.json, docs/c0-alignment/export-table.md, docs/c0-alignment/fixture-manifest.json and docs/c0-alignment/fixture-pack.json.

## Who reads the results

- **docs/c0-alignment/** has no reader in this repository.

## The other doors

**Release** runs scripts/sync-version.mjs, dogfood/__tests__/, packages/editor/src/__tests__/ and 117 more, checks dogfood/, e2e/, packages/editor/src/ and 222 more, reaches the repository root, and writes to docs/c0-alignment/export-table.json, docs/c0-alignment/export-table.md, docs/c0-alignment/fixture-manifest.json and docs/c0-alignment/fixture-pack.json.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/ except on a release event, and deploys the site except on a release event.

**world-forge-export** (a command people run) runs packages/export-ai-rpg/src/cli.ts and reaches schema.

**world-forge-export-godot** (a command people run) runs packages/export-godot/src/cli.ts and reaches schema.

**world-forge-export-unreal** (a command people run) runs packages/export-unreal/src/cli.ts and reaches schema.

## What breaks what

- **schema** is imported by 7 parts (dogfood, e2e, editor, export-ai-rpg, export-godot, export-unreal, renderer-2d) and sits on the path of 5 doors.
- **export-ai-rpg** is imported by 2 parts (dogfood, editor) and sits on the path of 3 doors.
- **export-godot** is imported by 2 parts (dogfood, editor) and sits on the path of 3 doors.
- **export-unreal** is imported by 2 parts (dogfood, editor) and sits on the path of 3 doors.
- **the repository root** is imported only from tests, by 1 part (dogfood), and sits on the path of 2 doors.
- **dogfood** is imported by no other part and sits on the path of 2 doors.
- **e2e** is imported by no other part and sits on the path of 2 doors.
- **editor** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

- **packages/export-godot/src/export.ts** and **packages/export-godot/src/index.ts** changed together in 12 of 16 commits, inside the export-godot part.
- **packages/export-unreal/src/export.ts** and **packages/export-unreal/src/index.ts** changed together in 5 of 7 commits, inside the export-unreal part.
- **packages/schema/src/index.ts** and **packages/schema/src/project.ts** changed together in 7 of 10 commits, inside the schema part.
- **packages/export-unreal/src/__tests__/export.test.ts** and **packages/export-unreal/src/import.ts** changed together in 8 of 12 commits, inside the export-unreal part.
- **packages/schema/src/index.ts** and **packages/schema/src/spatial.ts** changed together in 7 of 11 commits, inside the schema part.

5 files changed together with their own tests, as expected.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 14 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

- **docs/c0-alignment/export-table.json** is written by packages/export-ai-rpg/src/__tests__/c0-export-table.test.ts (a test) and read by nothing else in this repository.
- **docs/c0-alignment/export-table.md** is written by packages/export-ai-rpg/src/__tests__/c0-export-table.test.ts (a test) and read by nothing else in this repository.
- **docs/c0-alignment/fixture-manifest.json** is written by packages/export-ai-rpg/src/__tests__/c0-export-table.test.ts (a test) and read by nothing else in this repository.
- **docs/c0-alignment/fixture-pack.json** is written by packages/export-ai-rpg/src/__tests__/c0-export-table.test.ts (a test) and read by nothing else in this repository.
- **dogfood/worlds/multi-target-proof.worldforge.json** is written by dogfood/multi-target-export-proof.ts and read by nothing else in this repository.

## Helpers that look duplicated

These are candidates from names and call order, not a judgement.

- **buildFidelityReport** is exported by 3 parts (export-ai-rpg, export-godot and export-unreal); with the same name in this many parts it is most likely a shared contract, not a copy.
- **collectDroppedFieldFidelity** is exported by packages/export-godot/src/field-coverage.ts (export-godot) and packages/export-unreal/src/field-coverage.ts (export-unreal); the two look alike.
- **compareSemVer** is exported by packages/export-godot/src/migrations.ts (export-godot) and packages/export-unreal/src/migrations.ts (export-unreal); the two look alike.
- **convertConnections** is exported by 3 parts (export-ai-rpg, export-godot and export-unreal); with the same name in this many parts it is most likely a shared contract, not a copy.
- **convertDialogues** is exported by packages/export-ai-rpg/src/convert-dialogues.ts (export-ai-rpg) and packages/export-godot/src/convert-dialogues.ts (export-godot); the two look alike.

And 16 more candidates.

## Generated, never hand-edited

- **README.md** has a block written by scripts/sync-version.mjs when run outside CI.
- **docs/c0-alignment/export-table.json** is written by packages/export-ai-rpg/src/__tests__/c0-export-table.test.ts (a test).
- **docs/c0-alignment/export-table.md** is written by packages/export-ai-rpg/src/__tests__/c0-export-table.test.ts (a test).
- **docs/c0-alignment/fixture-manifest.json** is written by packages/export-ai-rpg/src/__tests__/c0-export-table.test.ts (a test).
- **docs/c0-alignment/fixture-pack.json** is written by packages/export-ai-rpg/src/__tests__/c0-export-table.test.ts (a test).
- **dogfood/worlds/multi-target-proof.worldforge.json** is written by dogfood/multi-target-export-proof.ts.

## Hand-authored

People write .claude/, .github/, assets/ and site/; 3 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → scripts/check-pack.mjs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 8 import sites could not be resolved.
- 1 file uses syntax the parser cannot read (packages/editor/src/panels/PresetBrowser.tsx), so what it imports is not known.
- 3 writes and 3 reads use paths built at run time and are not named here.
- 40 writes go to places this repository does not track, so they are not listed as generated.
- 30 writes and 56 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 3 commands are built at run time and not followed.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
