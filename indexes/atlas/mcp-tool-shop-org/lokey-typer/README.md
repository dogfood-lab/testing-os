# lokey-typer: how it works

Mapped at 2026-10-05 from commit a01d1a3 by Atlas 1.26.0.

## What this is

LoKey Typer is a calm typing practice app: a browser client, a Windows shell for the Store package, and ambient audio that stays on the device. (written by a person)

12 parts, mostly TypeScript (88 files), JavaScript (16), Python (9), C# (7), HTML (4) and CSS (3). Work enters through 3 doors; the busiest is CI, which reaches 6 parts. It publishes a container image. It deploys a site to GitHub Pages.

## What changed since 2026-10-05 (6b47e2c)

- CI no longer checks desktop/LoKeyTyper.Tests/LoKeyTyper.Tests.csproj.
- Docker now also runs site/astro.config.mjs, site/src/, src/ and 1 more.
- Docker now also checks docker/nginx.conf, package-lock.json, package.json and 2 more.
- src/assets/icons/ is now also written by scripts/icons/optimize_icons.py.
- src/content/packs/ is now written by scripts/generatePhase2Content.mjs.
- src/content/phase2/accessibility_presets.json is now written by scripts/generatePhase2Content.mjs.
- And 27 more new writers and readers of places.
- 294 files changed content, across 11 parts.

## What comes in

1. **CI.** On a pull request touching 18 paths; on a push touching 18 paths; or by hand. Runs scripts/qaAmbientAssets.mjs, scripts/qaSoundDesignManifesto.mjs, scripts/validatePhase2Content.mjs and 89 more; builds desktop/LoKeyTyper.sln; checks scripts/audio/check_bed_policy.py, scripts/audio/check_loudness.py, scripts/audio/check_spectrum.py and 1 more.
2. **Deploy to GitHub Pages.** On a push to main touching 11 paths; or by hand. Runs scripts/qaAmbientAssets.mjs, scripts/qaSoundDesignManifesto.mjs, scripts/validatePhase2Content.mjs and 89 more; checks scripts/audio/check_bed_policy.py, scripts/audio/check_loudness.py, scripts/audio/check_spectrum.py and 1 more.
3. **Docker.** When a release is published; or by hand. Runs site/astro.config.mjs, site/src/, src/ and 1 more; packs docker/nginx.conf, package-lock.json, package.json and 2 more into an image.

## What happens through CI

1. The workflow runs vite.config.ts in the repository root, scripts/qaAmbientAssets.mjs, scripts/qaSoundDesignManifesto.mjs and scripts/validatePhase2Content.mjs in scripts, site/astro.config.mjs and site/src/ in the site, src/ in src, and tests/ in tests; it builds desktop/LoKeyTyper.sln in desktop; it checks 4 files in scripts.
2. It uploads coverage to Codecov.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Deploy to GitHub Pages** runs scripts/qaAmbientAssets.mjs, scripts/qaSoundDesignManifesto.mjs, scripts/validatePhase2Content.mjs and 89 more, checks scripts/audio/check_bed_policy.py, scripts/audio/check_loudness.py, scripts/audio/check_spectrum.py and 1 more, and deploys the site.

**Docker** runs site/astro.config.mjs, site/src/, src/ and 1 more, packs docker/nginx.conf, package-lock.json, package.json and 2 more into an image, and publishes a container image.

## What breaks what

- **src** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.
- **the repository root** is imported by no other part and sits on the path of 3 doors.
- **the site** is imported by no other part and sits on the path of 3 doors.
- **scripts** is imported by no other part and sits on the path of 2 doors.
- **tests** is imported by no other part and sits on the path of 2 doors.
- **src/assets/icons/** is written by scripts and read by scripts; a hand edit reaches every reader.

## What tends to change together

- **src/features/home/pages/HomePage.tsx** and **src/features/modes/pages/ModePage.tsx** changed together in 5 of 6 commits, inside the src part.
- **tests/pages.test.tsx** and **tests/typingSession.test.tsx** changed together in 8 of 13 commits, inside the tests part.
- **src/features/daily/pages/DailySetPage.tsx** and **src/features/run/pages/RunPage.tsx** changed together in 9 of 16 commits, inside the src part.
- **src/app/components/AudioSettingsPanel.tsx** and **src/app/shell/AppShell.tsx** changed together in 6 of 11 commits, inside the src part.
- **src/features/daily/pages/DailySetPage.tsx** and **src/features/typing/TypingSession.tsx** changed together in 9 of 18 commits, inside the src part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 5 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **desktop** is imported by no test.
- **scripts** is imported by no test.

## Written but never read

- **src/app/components/Icon.tsx** is written by scripts/icons/generate_react_icons.py and read by nothing else in this repository.
- **src/content/packs/** is written by scripts/generatePhase2Content.mjs and read by nothing else in this repository.
- **src/content/phase2/accessibility_presets.json** is written by scripts/generatePhase2Content.mjs and read by nothing else in this repository.
- **src/content/phase2/content_index.json** is written by scripts/generatePhase2Content.mjs and read by nothing else in this repository.
- **src/content/phase2/micro_feedback_rules_v2.json** is written by scripts/generatePhase2Content.mjs and read by nothing else in this repository.
- **src/content/phase2/ui_strings_accessible.json** is written by scripts/generatePhase2Content.mjs and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **src/app/components/Icon.tsx** is written by scripts/icons/generate_react_icons.py.
- **src/assets/icons/** is written by scripts/icons/generate_icons.py and scripts/icons/optimize_icons.py.
- **src/content/packs/** is written by scripts/generatePhase2Content.mjs when run from the repository root, and committed.
- **src/content/phase2/accessibility_presets.json** is written by scripts/generatePhase2Content.mjs when run from the repository root, and committed.
- **src/content/phase2/content_index.json** is written by scripts/generatePhase2Content.mjs when run from the repository root, and committed.
- **src/content/phase2/micro_feedback_rules_v2.json** is written by scripts/generatePhase2Content.mjs when run from the repository root, and committed.
- **src/content/phase2/ui_strings_accessible.json** is written by scripts/generatePhase2Content.mjs when run from the repository root, and committed.

## Hand-authored

People write .github/, assets/, docs/, msix-package/, public/, the repository root, site/ and store-assets/. Nothing in this repository writes to them.

## Where to start

CI runs no code this map can follow; it only checks code, so there is no path of files to read in order.

## What this map cannot see

- 79 imports could not be resolved: `desktop/LoKeyTyper/WebContent/assets/index-uLDiQ1uZ.js` imports a path built at run time; `src/app/App.tsx` imports `@app/components/Icon`, which is not declared; `src/app/App.tsx` imports `@app/shell`, which is not declared; and 76 more.
- 3 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 47 reads go to a path their caller passes, not to this repository.
- 3 writes and 21 reads go to the directory the command is run in, not to this repository.
- 2 reads go to the directory the command is run in or a path their caller passes, not to this repository.
- 1 file belongs to no part: docker/nginx.conf.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
