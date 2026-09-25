# mcp-stress-test: how it works

Mapped at 2026-09-25 from commit a8a79e8.

## What this is

6 parts, mostly Python (76 files), TypeScript (2) and JavaScript (1). Work enters through 4 doors; the busiest is Publish, which reaches 3 parts. It publishes to PyPI and a container image. People run mcp-stress.

## What changed since 2026-09-23 (be7da06)

- CI now also runs src/mcp_stress_test/cli/__init__.py.
- Deploy site to GitHub Pages now also runs site/astro.config.mjs and site/src/.
- Publish now also runs src/mcp_stress_test/cli/__init__.py.
- And 2 more changes to doors.
- README.md is now also read by pyproject.toml.
- site/src/content/docs/ is now read by site/astro.config.mjs.
- site/src/content/docs/handbook/ is now read by site/astro.config.mjs.
- And 8 more new writers and readers of places.
- 134 files changed content, across 6 parts.

## What comes in

1. **Publish.** When a release is published; or by hand. Runs src/mcp_stress_test/cli/__init__.py and tests/; checks src/mcp_stress_test/. On a run by hand with publish_docker true, it also checks README.md, pyproject.toml and src/.
2. **CI.** On a pull request to main; on a push to main touching 8 paths; or by hand. Runs src/mcp_stress_test/cli/__init__.py and tests/; checks src/.
3. **Deploy site to GitHub Pages.** On a pull request to main touching 2 paths; on a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **mcp-stress** (a command people run). Runs src/mcp_stress_test/cli/__init__.py.

## What happens through Publish

1. The workflow runs src/mcp_stress_test/cli/__init__.py in src and tests/ in tests; it checks src/mcp_stress_test/ in src.
2. On a run by hand with publish_docker true, it also checks README.md, pyproject.toml and src/.
3. It uploads dist/* to the release on a release event.
4. It publishes a container image (on a run by hand, only with publish_docker true).
5. It publishes to PyPI (on a run by hand, only with publish_pypi true).

## Who reads the results

Publish writes nothing this map can see.

## The other doors

**CI** runs src/mcp_stress_test/cli/__init__.py and tests/, and checks src/.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site on a push to main.

**mcp-stress** (a command people run) runs src/mcp_stress_test/cli/__init__.py.

## What breaks what

- **src** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.
- **tests** is imported by no other part and sits on the path of 2 doors.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

- **site** is imported by no test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **.github/** is written by dependabot[bot], which added every file in it.
- **docs/** is written by dependabot[bot], which added every file in it.
- **the repository root** is written by dependabot[bot], which added every file in it.
- **site/** is written by dependabot[bot], which added every file in it.

## Hand-authored

No configuration or documentation part is left to people alone.

## Where to start

.github/workflows/ci.yml → src/mcp_stress_test/cli/__init__.py → src/mcp_stress_test/cli/main.py → src/mcp_stress_test/__init__.py → src/mcp_stress_test/cli/commands/chain.py → src/mcp_stress_test/cli/commands/fuzz.py → src/mcp_stress_test/cli/commands/generate.py → src/mcp_stress_test/cli/commands/info.py

Read those in order to follow one pull request end to end.

## What this map cannot see

- 2 imports could not be resolved: `tests/test_operator_contract.py` imports a path built at run time; `tests/test_operator_contract.py` imports a path built at run time.
- 15 writes and 14 reads use paths built at run time and are not named here.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
