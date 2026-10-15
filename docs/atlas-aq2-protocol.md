# Atlas AQ-2: the pre-registered protocol for the inferred tiers

**Status:** registered 2026-10-15, before any mining. Written by the Atlas session; read by R&D before the first fetch.
This file is committed first. Nothing below is changed after mining starts except by a dated amendment at the end that
does not touch the bar, the case definition, the labels or the stop rules; an amendment that would is a new protocol.

**What this decides.** Whether the two inferred tiers of `atlas_reach` turn on in release 1.27.0:

- tier 2, a value import of the changed export (inferred; a runtime consequence);
- tier 3, a type-only import of the changed export (inferred; a build consequence; a type change can be compatible,
  so this tier reports use, not breakage).

Tier 1, the consumers that declare the producer's package, is unaffected and is never removed from an answer by a tier.

## The bar (R&D, 2026-10-13; copied as written)

- The inferred tiers never remove a tier-1 consumer from an answer. They annotate and rank. A miss in tier 2 or 3
  then hides nothing tier 1 shows. Recall is the safety number, and precision the attention number.
- A tier turns on only if all three hold: a seed of at least 20 breaking-change cases; recall at least 0.8 on the
  Wilson 95% lower bound; precision at least 0.8 as a point estimate. Otherwise it stays off, and the release says why.
- Labels: a positive is a consumer that adapted to the producer's change, or went red on the bump; a consumer that
  never adopted the version is excluded, not counted as a negative; only changes that removed or broke an export count,
  not compatible additions.

The Wilson 95% lower bound for `k` successes of `n` at `z = 1.96` is
`(p + z²/2n − z·sqrt(p(1−p)/n + z²/4n²)) / (1 + z²/n)` with `p = k/n`.

## Rules that bind the whole run

1. **One session.** The mining of fleet history is limited to this session. There is no second attempt.
2. **Git history only; never the engine's output.** Cases and labels are chosen with `git`, `gh`, `grep` and
   `jq`-style text tools. The engine's parser and its maps are not used to select a case, pair a consumer or label an
   outcome. (Otherwise recall would be measured only on exports the parser already sees.) The engine runs once,
   after the case list and labels are frozen, only to produce the prediction being scored (see Scoring).
3. **Population is the fleet.** The repositories in `E:/atlas-fleet-158/repos.txt` (98 clones). Public dependents
   outside the fleet are not added.
4. **Frozen before scoring.** The case list and every label are written to a file in the scratch folder, with each
   label's source (commit id, `gh` run id), and the file's sha256 is recorded in the report before the engine is run.
   Labels are not edited after that.
5. **Read-only toward the world.** No push, no workflow run, no re-run of a CI job, no comment. `gh` reads only.
   The scratch clones are the only thing written, and they are deletable.
6. **Cost cap for all of it.** Affinity `0x3C` (E-cores 2 to 5), BelowNormal priority, started with
   `start /AFFINITY 3C /BELOWNORMAL` so children inherit it, `typeperf` total CPU every 5 s, a `STOP` file checked at
   every repository boundary, one repository at a time. If total CPU holds above 60% for 30 s the run stops at the
   next safe point and reports. Nothing else heavy runs meanwhile, and the fetch does not start until R&D has said
   its build is done. The wall time and the peak and average CPU go in the report.

## Step 0: the upper-bound count (text tools only)

**Fetch.** `git fetch --refetch --tags` (full history, so shallow clones cannot hide a commit) for the producer
repositories and the consumer repositories, one at a time.

**Pairs.** A producer is a fleet repository that publishes a non-private package (a tracked `package.json` without
`"private": true`) which another fleet repository declares in a tracked `package.json` (`dependencies`,
`devDependencies`, `peerDependencies`, `optionalDependencies`). A consumer is a repository that declares it. This
reads manifests as text. The forecast from the AO fleet read is about 44 consumer pairs from about five to ten
producers; the count actually found is reported, not assumed.

**Candidate producer commit.** A commit on the producer's default branch history that touches a file of the
published package (its directory, excluding tests, fixtures, docs and comments-only changes) and whose diff, read as
text, contains **at least one removed or changed export**. The patterns, applied to the removed (`-`) lines of the
diff of non-test source files:

- ES: `export function|async function|class|const|let|var|interface|type|enum|default <name>`, and names inside
  `export { … }` and `export * from`;
- CommonJS: `module.exports =`, `module.exports.<name> =`, `exports.<name> =`;
- the package's `exports`, `main`, `bin` and `types` keys in `package.json` (a removed or renamed subpath is a
  removed export);
- a removed name counts as **removed**; a removed line whose name reappears on an added line with a different
  signature (parameters, return type, kind) counts as **changed**; a name that reappears unchanged (a move or a
  reformat) does not count; an added-only export is a compatible addition and does not count.

This is an upper bound by design: it counts commits, once each, and cannot tell whether any consumer was affected.

**Stop rule.** If the number of candidate producer commits is **under 20**, the bar's seed is unreachable. The report
gives the count, the repositories and the commit range scanned, keeps both tiers off with that reason, and the work
stops. The release is cut with the tiers off and says why. No pairing or labelling is done.

## Step 1: pairing (only if step 0 reaches 20)

A **case** is a candidate producer commit `P` together with a consumer `C` that adopted a version containing `P`.

- The producer version at `P` is the `version` in the package's `package.json` at the first release (tag, or
  version-bump commit) at or after `P`.
- `C` **adopted** it when a commit `B` on `C`'s history moves its declaration (the range in `package.json`, or the
  resolved version in the lockfile) from a version before `P`'s release to one at or after it. `B` is the **bump
  commit**. A consumer that never adopted, or whose declaration is a workspace link or a git ref that cannot be
  ordered, is **excluded** (not counted as a negative), and the exclusion count is reported.
- A consumer must reference the changed name in its own history as text (`grep -w <name>` over its tracked source
  at the commit before `B`) to enter scoring as a candidate for a tier; a consumer that does not mention the name
  is kept as a tier 1 consumer only (it takes part in the label step, not in the tier's precision).

## Step 2: labels

For each case and consumer that adopted:

- **Positive, adapted.** Within the first 30 commits after `B`, or until the consumer's next bump of the same package
  (whichever comes first), a commit touches a tracked source file that mentions the changed name (`grep -w`) and
  that file mentioned it at `B`'s parent. Recorded with the commit id.
- **Positive, red on the bump.** The consumer's CI run on `B` concluded `failure`, read through `gh run list`/`gh run
  view`, **and** the next commit that turns that workflow green touches a file that mentions the changed name. The
  run id of the red run and of the green run are recorded with the label. A red run that does not meet both halves
  is not a positive and is reported separately.
- **Not a positive.** Adopted, green on `B`, and no adaptation within the window. Such a pair is a negative only
  for the tier-precision count when the tier predicted it (see Scoring); it is never used to weaken recall.

Changed or removed names that only ever existed in files the consumer does not track (generated output) are
excluded and counted.

## Scoring (only after the case list and labels are frozen and hashed)

For each case and adopted consumer, the engine is run once on the consumer **at `B`'s parent**, and the tier it assigns
the consumer for the changed name is read from its record of that consumer's imports. A consumer is **flagged** for
tier 2 when the engine records a value import of the changed name, and for tier 3 when it records a type-only import
of it. Then, per tier, over the adopted consumers:

- **recall** = positives flagged by that tier / all positives of that kind (a value positive is one whose adapting
  file imports the name as a value; a type positive, one that imports it only as a type, both read from text);
  reported as a point estimate with its Wilson 95% lower bound;
- **precision** = positives flagged by that tier / all consumers flagged by that tier.

A tier turns on only if the bar holds for it. Each tier is decided on its own.

## Report

Against the bar exactly as written, the report gives: the repositories and the commit range scanned, the number of
candidate producer commits (step 0), the pairs and exclusions, the seed size (cases that reached scoring), the labels
by kind, per tier recall (point and Wilson 95% lower bound) and precision, the decision (on, or off with the reason), the
sha256 of the frozen case file, the commands run, and the wall time with the peak and average CPU. If the seed is
short the tiers stay off and the report says how short and why; the release says it too.

## Standards compliance

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 2 | Commands, patterns, windows and thresholds are written above and frozen by this commit; the case file is hashed before scoring. |
| ANDON_AUTHORITY | 2 | The step-0 stop rule, the CPU stop rule and the `STOP` file at repository boundaries halt the run; a short seed halts before any scoring. |
| NAMED_COMPENSATORS | n/a | No irreversible call: reads only (`git`, `gh`); the scratch clones are deletable by the Atlas session. |
| DECOMPOSE_BY_SECRETS | 2 | Selection and labelling (text, history) are separate from scoring (the engine), so a parser blind spot cannot shape the seed. |
| UNCERTAINTY_GATED_HUMANS | 2 | R&D reads this before the fetch and gets the step-0 count before any pairing; the stop rule asks no one. |
| EXTERNAL_VERIFIER | n/a | No specialised claim; R&D's read of the protocol and of the report is the check. |
