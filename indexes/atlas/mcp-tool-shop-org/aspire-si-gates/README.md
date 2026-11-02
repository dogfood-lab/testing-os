# aspire-si-gates: how it works

Mapped at 2026-11-02 from commit 967bf47 by Atlas 1.26.0.

## What this is

aspire-si-gates is the Stage 1 data gates for role-training sets: one standard-library Python package that decides whether a row, a batch or a frozen set is fit to train on. It reads the rows it is given and nothing else. (written by a person)

6 parts, mostly Python (13 files), CSS (2), TypeScript (2), Astro (1), JavaScript (1) and shell (1). Work enters through 4 doors; the busiest is ci, which reaches 2 parts. It publishes to PyPI. It deploys a site to GitHub Pages. People import aspire_si_gates.

## What changed since 2026-10-29 (250845f)

- ci now also runs tests/test_workflows.py.
- Release no longer starts by hand.
- src/aspire_si_gates/*.py is now read by src/aspire_si_gates/__init__.py.
- 1 file added and 5 changed content, across 4 parts.

## What comes in

1. **ci.** On a pull request; on a push to main touching 6 paths; or by hand. Runs tests/test_apply_item.py, tests/test_closed_form.py, tests/test_material_and_puzzles.py and 3 more.
2. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
3. **Release.** When a release is published. Checks src/.
4. **aspire_si_gates** (the package people import). Loads src/aspire_si_gates/__init__.py.

## What happens through ci

1. The workflow runs 6 files in tests.
2. That reaches src (6 files).

## Who reads the results

ci writes nothing this map can see.

## The other doors

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**Release** checks src/, publishes to PyPI, and uploads dist/*.tar.gz and dist/*.whl to the release.

**aspire_si_gates** (the package people import) loads src/aspire_si_gates/__init__.py.

## What breaks what

- **src** is imported only from tests, by 1 part (tests), and sits on the path of 3 doors.

scripts holds only shell files, which this map does not read, so what uses it cannot be seen.

## What tends to change together

No two source files changed together often enough to name.

Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.

## What no test touches

Every code part this map reads is imported by at least one test.

scripts holds only shell files, which this map does not read, so whether a test touches it cannot be seen.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

src/aspire_si_gates/__init__.py → src/aspire_si_gates/context.py → src/aspire_si_gates/gates.py → src/aspire_si_gates/answer_format.py

Read those in order to follow one import of aspire_si_gates end to end. This path follows aspire_si_gates (the package people import) from its entry, since ci runs only tests.

## What this map cannot see

- 3 reads go to a path their caller passes, not to this repository.
- Statistics confidence is low: fewer than 30 qualifying commits in the window, and fewer than 25 source files reach 10 revisions.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
