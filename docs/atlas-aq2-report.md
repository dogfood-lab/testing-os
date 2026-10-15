# Atlas AQ-2: the report on the inferred tiers

Run 2026-10-15 under [the protocol](atlas-aq2-protocol.md) as amended at 77c5c738. It is written against the bar as the
protocol copies it.

## Decision, from the frozen figures

**Both inferred tiers (tier 2, a value import of the changed export; tier 3, a type-only import) stay off in 1.27.0.**

- **371 adopted cases, 13 positives** under the frozen labels (`labels.json`, sha256 prefix 1da100ddb633151851e3df35).
- **A Wilson 95% lower bound of 0.772 for recall even if all 13 had been flagged.** The recall bar needs 16 of 16 (0.806;
  15 of 15 gives 0.796; with one miss it takes 24 of 25). So the bar is unreachable by count, before any engine run.
- The tiers stay off for that reason: too few positives, not the engine. No engine scoring was run; it could not change
  the decision.

Tier 1, the consumers that declare the producer's package, is unaffected.

The release cuts with the tiers off and one line saying why: AQ-2 mined 371 adopted cases and found 13 positives,
fewer than the 16 the recall bar needs even if every one were flagged, so the tiers are off.

## What was scanned

- **Producers:** 6 fleet repositories (site-theme, loadout-os, ai-rpg-engine, attestia, repomesh, npm-launcher), 29
  published packages read from tracked `package.json` files.
- **Consumers:** the 97 fleet repositories that declare one of those packages. Every clone was re-fetched in full
  (`git fetch --refetch --no-filter --tags`), one at a time.
- **Commits:** 1,803 non-merge commits touching the 29 package directories on each default branch, dated 2026-02-22 to
  2026-10-14.

## The figures

| Step | Count |
|---|---|
| Step 0: candidate producer commits (removed or changed an export) | 38 (31 without site-theme); the floor of 20 is cleared |
| of them in ai-rpg-engine / site-theme / repomesh / attestia | 27 / 7 / 3 / 1 |
| Commit x package entries with a release | 40 (no unreleased commit) |
| Adopted cases (producer commit x consumer whose level crosses the release) | 371 |
| Excluded: consumer already at or above the release when its history began | 310 |
| Excluded: consumer never crossed the release | 89 |
| Positives under the frozen labels | 13 (adapted 13; red on the bump and green on a commit naming the export 1, which is also adapted) |

By producer:

| Producer | Cases | Positives |
|---|---|---|
| site-theme | 328 | 8 |
| ai-rpg-engine | 40 | 5 |
| attestia | 3 | 0 |
| repomesh, loadout-os, npm-launcher | 0 | 0 |

By kind of change, all 13 positives are "changed"; none is "removed". CI on the bump commit: 56 cases had a failed run;
one turned green on a commit that touches a file naming the export.

## The clustering (advisory, apart from the frozen figures)

This is the Atlas session's own read, made after the labels were frozen. The labels are not changed.

- Eight of the 13 positives come from one site-theme commit (2dc4cccd) and one changed name, `verify`. The text rule
  matched the common word in unrelated consumer lines (`npm run verify`, comments, a test title); none is an adaptation
  to a theme change.
- Without those eight the count is 5, all from ai-rpg-engine (claude-rpg and world-forge). Those five are added or
  removed lines mentioning the name in test or smoke files, so even they are what the mechanical rule gives, not proven
  adaptations.
- Either count is under 16, so the read does not move the decision.

## What this teaches the next attempt

- A text-mention rule for adaptation over-counts common names. One word produced 8 of the 13 positives.
- Fleet history yields few real breaking changes that consumers adopted. All 13 positives are "changed", none is
  "removed".
- 328 of the 371 cases come from one CSS and configuration package, whose consumers do not import code from it in the
  way the tiers measure.
- Any later attempt needs a different seed source, such as constructed cases or a wider population. That is the reason
  this attempt could not reach the bar; it is not a plan.

## How step 0 read exports

Whole-file export sets before and after each commit, by regular expression over the file text, not diff lines, so a
multi-line `export { … }` list is read whole. The definition is the protocol's: removed means no declaration anywhere in
the package after the commit; changed means the declaration line differs after whitespace is squashed. A cruder
independent grep for a removed export line found 125 commits; 31 are also in the 38. Of the other 94, four were read
(each rewrites a list line or moves a declaration while the names stay, so none is a removal) and 90 were not read.

## Frozen files

Hashed before any later step (sha256 prefixes): `step0.json` 4668a65c2313fdd9, `cases.json` ef87ac2df7445dc5,
`labels.json` 1da100ddb633151851e3df35, `pairs.json` b5184ef1d035cc35. The files and scripts are in the Atlas session's
scratch folder.

## Cost

Every step ran with affinity `0x3C`, BelowNormal, and `typeperf` every 5 s. Total machine CPU, per phase:

| Phase | Wall | Peak | Average |
|---|---|---|---|
| Pairs from manifests, step 0, and the six producer fetches | 5 s, 5 s, 10 s | no sample | no sample |
| Fetch of 13 consumers | 0.5 min | 15.3% | 14.5% |
| Fetch of the last 84 consumers | 4.0 min | 25.9% | 9.9% |
| Pairing (two runs, same result) | 1.3 min each | 20.0%, 15.1% | 13.8%, 13.0% |
| Labelling | 3.1 min | 17.8% | 10.3% |

Three phases (the pairs read, step 0 and the producer fetches) were each too short for a 5-second sample, so there are no
CPU figures for them. Nothing measured went above 50%.
