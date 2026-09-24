# backpropagate: how it works

Mapped at 2026-09-24 from commit fd35beb.

## What this is

11 parts, mostly Python (125 files). Work enters through 12 doors; the busiest is CI, which reaches 4 parts. It publishes to npm and PyPI, and a container image. People run backprop and backpropagate.

## What changed since 2026-09-23 (34a7862)

- Pages deploy now also runs site/astro.config.mjs and site/src/.
- Post-Publish Smoke now also runs backpropagate/cli.py.
- Publish now also runs bin/backpropagate.js.
- And 4 more changes to doors.
- .github/mutmut-baseline.txt is now written by .github/workflows/mutmut.yml.
- .github/workflows/ci.yml is now read by docs/ci-gates-triage-plan.md.
- README.md is now also read by tests/test_model_card.py.
- And 15 more new writers and readers of places.
- .github was generated and is now mixed.
- 247 files changed content, across 10 parts.

## What comes in

1. **CI.** On a pull request; on a push to main touching 8 paths; or by hand. Runs tests/ and verify.sh; checks backpropagate/.
2. **Publish.** When a release is published; when the workflow Release completes; or by hand. Runs bin/backpropagate.js; checks LICENSE, README.md, backpropagate/ and 1 more.
3. **Nightly Train Smoke.** On a schedule (`0 4 * * 1`), Monday at 04:00 UTC; or by hand. Runs scripts/nightly_train_smoke.py.
4. **Doc Drift Check.** On a pull request; on a push to main touching 7 paths; or by hand. Runs scripts/check_doc_drift.py.
5. **Pages deploy.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
6. **Post-Publish Smoke.** When the workflow Publish completes; or by hand. Runs backpropagate/cli.py.
7. **Mutation testing (mutmut).** By hand. Runs no file this map can see.
8. **OpenSSF Scorecard.** On a `branch_protection_rule` event; on a push to main; on a schedule (`0 6 * * 1`), Monday at 06:00 UTC; or by hand. Runs no file this map can see.
9. **Release.** When a tag matching `v*` is pushed; or by hand. Runs no file this map can see.
10. **backprop** (a command people run). Runs backpropagate/cli.py.
11. **backpropagate** (a command people run, from package.json). Runs bin/backpropagate.js.
12. **backpropagate** (a command people run, from pyproject.toml). Runs backpropagate/cli.py.

## What happens through CI

1. The workflow runs verify.sh in the repository root and tests/ in tests; it checks backpropagate/ in backpropagate.
2. That reaches scripts (1 file).

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Publish** runs bin/backpropagate.js, checks LICENSE, README.md, backpropagate/ and 1 more, and publishes to PyPI and a container image.

**Nightly Train Smoke** runs scripts/nightly_train_smoke.py, reaches backpropagate, and opens an issue when it fails.

**Doc Drift Check** runs scripts/check_doc_drift.py.

**Pages deploy** runs site/astro.config.mjs and site/src/, and deploys the site.

**Post-Publish Smoke** runs backpropagate/cli.py and opens an issue when it fails.

**Mutation testing (mutmut)** runs no file this map can see, writes to .github/mutmut-baseline.txt, commits .github/mutmut-baseline.txt and pushes to a branch for review, never to main, and opens a pull request.

**OpenSSF Scorecard** runs no file this map can see.

**Release** runs no file this map can see, publishes to npm, and creates a GitHub release.

**backprop** (a command people run) runs backpropagate/cli.py.

**backpropagate** (a command people run, from package.json) runs bin/backpropagate.js.

**backpropagate** (a command people run, from pyproject.toml) runs backpropagate/cli.py.

## What breaks what

- **backpropagate** is imported by 1 part (scripts), and by 1 more only from tests; it sits on the path of 6 doors.
- **scripts** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.
- **bin** is imported by no other part and sits on the path of 2 doors.
- **the repository root** is imported by no other part and sits on the path of 2 doors.
- **CITATION.cff** is written by scripts and read by scripts; a hand edit reaches every reader.

## What tends to change together

- **backpropagate/cli.py** and **backpropagate/trainer.py** changed together in 28 of 52 commits, inside the backpropagate part.

2 files changed together with their own tests, as expected.

Window: 180 days; a pair counts from 10 shared commits, since 20 source files reach 10 revisions; the floor falls to 3 when fewer than 20 do.

## What no test touches

- **bin** is imported by no test.

## Written but never read

- **.github/mutmut-baseline.txt** is written by .github/workflows/mutmut.yml and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **.github/mutmut-baseline.txt** is written by .github/workflows/mutmut.yml.
- **CITATION.cff** is written by scripts/prep_release.sh.

## Hand-authored

People write .claude/, assets/, docs/, examples/ and site/; 13 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → tests/test_check_doc_drift.py → scripts/check_doc_drift.py

Read those in order to follow one pull request end to end.

## What this map cannot see

- 40 import sites name a declared dependency that shares its name with a local module (datasets); they are read as the dependency, which is not in this repository.
- 6 import sites could not be resolved.
- 13 writes and 33 reads use paths built at run time and are not named here.
- 3 writes and 9 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
