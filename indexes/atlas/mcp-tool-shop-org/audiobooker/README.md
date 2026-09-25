# audiobooker: how it works

Mapped at 2026-09-25 from commit 651511a.

## What this is

10 parts, mostly Python (131 files), JavaScript (2) and TypeScript (2). Work enters through 5 doors; CI and Publish to GHCR each reach 3 parts, and CI is followed because a pull request goes through it. It publishes to PyPI, @mcptoolshop/audiobooker to npm, and a container image. People run audiobooker.

## What changed since 2026-09-25 (d8ba5c2)

- CI now also runs audiobooker/__init__.py, audiobooker/casting/voice_registry.py, audiobooker/casting/voice_suggester.py and 13 more.
- No file changed.

## What comes in

1. **CI.** On a pull request to main; on a push to main touching 5 paths; or by hand. Runs audiobooker/__init__.py, audiobooker/casting/voice_registry.py, audiobooker/casting/voice_suggester.py and 97 more; checks audiobooker/.
2. **Publish to GHCR.** When a release is published; or by hand. Runs audiobooker/cli.py; checks LICENSE, README.md, audiobooker/ and 1 more. On a release event, it also runs tools/read_project_version.py.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **Release.** When a release is published; or by hand. On a release event, it runs tools/read_project_version.py.
5. **audiobooker** (a command people run). Runs audiobooker/cli.py.

## What happens through CI

1. The workflow runs 17 files in audiobooker, tests/ in tests, and tools/check_ci_policy.py and tools/check_pyright_gate.py in tools; it checks audiobooker/ in audiobooker.
   1. Inside audiobooker/nlp/speaker_resolver.py, `suggest_aliases` does, in order: `get_profile` and `BookNLPAdapter`.
   2. Inside audiobooker/renderer/engine.py, `render_project_detailed` does, in order:
      1. `get`
      2. `check_ffmpeg`
      3. `_resolve_loudnorm_profile`
      4. `get_cache_root`
      5. `get_manifest_path`
      6. `render_params_hash`
      7. `load_manifest`
      8. `CacheManifest`
      9. `RenderProgressTracker`
      10. `RenderFailureReport`
      11. `chapter_text_hash`
      12. `casting_hash`, and 2 more
   3. Inside audiobooker/renderer/output.py, `assemble_m4b` does, in order: `RealFFmpegRunner` and `RealFFmpegRunner`.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Publish to GHCR** runs audiobooker/cli.py, checks LICENSE, README.md, audiobooker/ and 1 more, runs tools/read_project_version.py on a release event, and publishes a container image on a release event.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Release** runs tools/read_project_version.py on a release event, writes to npm/CHANGELOG.md, which is not tracked, and publishes to PyPI and @mcptoolshop/audiobooker to npm on a release event.

**audiobooker** (a command people run) runs audiobooker/cli.py.

## What breaks what

- **audiobooker** is imported by 1 part (examples), and by 1 more only from tests, is run as a child process by 1 part (tools), and sits on the path of 3 doors.
- **tools** is imported by no other part and sits on the path of 3 doors.

## What tends to change together

- **audiobooker/parser/epub.py** and **audiobooker/parser/pdf.py** changed together in 7 of 8 commits, inside the audiobooker part.
- **audiobooker/parser/pdf.py** and **audiobooker/parser/text.py** changed together in 6 of 8 commits, inside the audiobooker part.
- **audiobooker/renderer/cache_manifest.py** and **audiobooker/renderer/hash_utils.py** changed together in 5 of 7 commits, inside the audiobooker part.
- **audiobooker/parser/epub.py** and **audiobooker/parser/text.py** changed together in 6 of 9 commits, inside the audiobooker part.
- **audiobooker/parser/docx.py** and **audiobooker/parser/pdf.py** changed together in 4 of 8 commits, inside the audiobooker part.

Confidence is low: fewer than 25 source files reach 10 revisions in the window.

Window: 180 days; a pair counts from 3 shared commits, since 4 source files reach 10 revisions; the floor rises to 10 when 25 do.

## What no test touches

- **examples** is imported by no test.
- **tools** is imported by no test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, assets/, docs/, npm/, the repository root and site/; 31 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → audiobooker/cli.py → audiobooker/renderer/engine.py → audiobooker/__init__.py → audiobooker/labels.py → audiobooker/shell_quote.py → audiobooker/errors.py → audiobooker/renderer/__init__.py

Read those in order to follow one pull request end to end.

## What this map cannot see

- 14 import sites name a declared dependency that shares its name with a local module (docx); they are read as the dependency, which is not in this repository.
- 7 imports could not be resolved: `audiobooker/cli.py` imports a path built at run time; `audiobooker/cli.py` imports a path built at run time; `audiobooker/language/profile.py` imports a path built at run time; and 4 more.
- 31 writes and 25 reads use paths built at run time and are not named here.
- 1 write goes to places this repository does not track, so it is not listed as generated.
- 3 writes and 5 reads go to the home directory (.local/, AppData/ and audiobooker/) or a path their caller passes, not to this repository.
- 6 reads go to a path their caller passes, not to this repository.
- 1 write and 2 reads go to the home directory (.config/, AppData/ and audiobooker/), not to this repository.
- 4 commands are built at run time and not followed.
- Statistics confidence is low: fewer than 25 source files reach 10 revisions in the window.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
