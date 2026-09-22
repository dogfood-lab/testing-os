generated: 1b16afc  2026-09-22T16:37:30.539Z
structure: 22 boundaries · 1 unassigned · 30 unresolved sites
statistics: atlas/machine-stats.txt · sha256 476adf7fe107a722fbca574a9551a40065e8d7a71b9bba646b65350a790d1a05 · withdraw-after: 2026-10-20T16:37:30.539Z
rule: if now (UTC) is after withdraw-after, do not load the statistics file;
      withdrawn numbers are not evidence that files are uncoupled
confidence: full

## Coarse
.github  config  proposed  files 7  imports → none  ← imported by none  entry points: none
assets  config  proposed  files 1  imports → none  ← imported by none  entry points: none
atlas  code  proposed  files 46  imports → none  ← imported by none  entry points: packages/atlas/cli.js, packages/atlas/index.js
docs  docs  proposed  files 21  imports → none  ← imported by none  entry points: none
dogfood  config  proposed  files 15  imports → schemas  ← imported by none  entry points: none
dogfood-swarm  code  proposed  files 349  imports → findings, report, schemas  ← imported by ingest, schemas, scripts  entry points: packages/dogfood-swarm/cli.js
examples  config  proposed  files 5  imports → none  ← imported by none  entry points: none
findings  code  proposed  files 81  imports → ingest, schemas, verify  ← imported by dogfood-swarm, ingest, portfolio, scripts  entry points: packages/findings/cli.js, packages/findings/index.js
fixtures  code  proposed  files 147  imports → none  ← imported by none  entry points: none
indexes  config  proposed  files 21  imports → none  ← imported by none  entry points: none
ingest  code  proposed  files 80  imports → dogfood-swarm, findings, schemas, verify  ← imported by findings, scripts  entry points: packages/ingest/run.js
policies  config  proposed  files 15  imports → none  ← imported by none  entry points: none
portfolio  code  proposed  files 23  imports → findings  ← imported by scripts  entry points: packages/portfolio/generate.js
records  config  proposed  files 94  imports → none  ← imported by none  entry points: none
report  code  proposed  files 24  imports → schemas  ← imported by dogfood-swarm  entry points: packages/report/build-submission.js, packages/report/cli.js, packages/report/init.js
reports  config  proposed  files 2  imports → none  ← imported by none  entry points: none
root  docs  proposed  files 21  imports → none  ← imported by none  entry points: none
schemas  code  proposed  files 37  imports → dogfood-swarm  ← imported by dogfood, dogfood-swarm, findings, ingest, report, scripts, verify  entry points: packages/schemas/src/index.ts
scripts  code  proposed  files 63  imports → dogfood-swarm, findings, ingest, portfolio, schemas, verify  ← imported by none  entry points: none
site  code  proposed  files 31  imports → none  ← imported by none  entry points: none
swarms  docs  proposed  files 15  imports → none  ← imported by none  entry points: none
verify  code  proposed  files 63  imports → schemas  ← imported by findings, ingest, scripts  entry points: packages/verify/cli.js, packages/verify/index.js

## Fine

<!-- tokens estimated as characters divided by four -->
### schemas
entry points: packages/schemas/src/index.ts
unresolved sites: 0
edges:
- dogfood → schemas (import)
- dogfood-swarm → schemas (import)
- findings → schemas (import)
- ingest → schemas (import)
- report → schemas (import)
- schemas → dogfood-swarm (import)
- scripts → schemas (import)
- verify → schemas (import)
files:
- packages/schemas/LICENSE
- packages/schemas/README.md
- packages/schemas/package.json
- packages/schemas/src/enums.ts
- packages/schemas/src/index.ts
- packages/schemas/src/json/agent-output.schema.json
- packages/schemas/src/json/atlas-divergence.schema.json
- packages/schemas/src/json/case-file.schema.json
- packages/schemas/src/json/dogfood-doctrine.schema.json
- packages/schemas/src/json/dogfood-finding.schema.json
- packages/schemas/src/json/dogfood-pattern.schema.json
- packages/schemas/src/json/dogfood-recommendation.schema.json
- packages/schemas/src/json/dogfood-record-submission.schema.json
- packages/schemas/src/json/dogfood-record.schema.json
- packages/schemas/src/json/dogfood-roadmap.schema.json
- packages/schemas/src/json/policy.schema.json
- packages/schemas/src/json/scenario.schema.json
- packages/schemas/src/payload-types.ts
- packages/schemas/src/schema-versions.ts
- packages/schemas/src/validate.ts
- packages/schemas/test/atlas-divergence-schema.test.ts
- packages/schemas/test/case-file-criterion-ids.test.ts
- packages/schemas/test/f-3ed78d6f-comparand-type.test.ts
- packages/schemas/test/f-fe05c6d7-dogfood-roadmap-schema.test.ts
- packages/schemas/test/h4-reject-reason-conditional.test.ts
- packages/schemas/test/payload-types.test.ts
- packages/schemas/test/schema-versions.test.ts
- packages/schemas/test/schemas.test.ts
- packages/schemas/test/stageA-agent-output-lockstep.test.ts
- packages/schemas/test/stageA-policy-enforcement-conditional.test.ts
- packages/schemas/test/stageA-scenario-verifiable-conditional.test.ts
- packages/schemas/test/stageC-cross-contract-enum-seal.test.ts
- packages/schemas/test/stageC-load-parse-error-context.test.ts
- packages/schemas/test/stageC-supported-versions-lockstep-seal.test.ts
- packages/schemas/test/validate.test.ts
- packages/schemas/test/verify-f2-f4-tags-warnings.test.ts
- packages/schemas/tsconfig.json
### findings
entry points: packages/findings/cli.js, packages/findings/index.js
unresolved sites: 0
edges:
- dogfood-swarm → findings (import)
- findings → ingest (import)
- findings → schemas (import)
- findings → verify (import)
- ingest → findings (import)
- portfolio → findings (import)
- scripts → findings (import)
files:
- packages/findings/LICENSE
- packages/findings/README.md
- packages/findings/advise/advice-bundle.js
- packages/findings/advise/advise-json-cli.test.js
- packages/findings/advise/advise.test.js
- packages/findings/advise/f-d022c023-query-doctrine-surface-filter.test.js
- packages/findings/advise/index.js
- packages/findings/advise/query.js
- packages/findings/cli.js
- packages/findings/derive/d2b-002-write-schema-gate.test.js
- packages/findings/derive/d2b-008-collision-guard.test.js
- packages/findings/derive/dedupe.js
- packages/findings/derive/derive-findings.js
- packages/findings/derive/derive.test.js
- packages/findings/derive/f-88fb37ff-blocked-scenario-requires-step-evidence.test.js
- packages/findings/derive/f-e42e8f80-blocked-scenario-skip-evidence.test.js
- packages/findings/derive/findings-a-001-write-path-traversal.test.js
- packages/findings/derive/fvr-001-step-failure-scenario-collision.test.js
- packages/findings/derive/ids.js
- packages/findings/derive/index.js
- packages/findings/derive/load-records-skip.test.js
- packages/findings/derive/load-records.js
- packages/findings/derive/proac-002-derive-skip-signal.test.js
- packages/findings/derive/rules.js
- packages/findings/derive/write-findings.js
- packages/findings/f-58316c9f-actor-usage-default.test.js
- packages/findings/f-720be224-unknown-flag-rejection.test.js
- packages/findings/feat-findings-grep.test.js
- packages/findings/feat-findings-json.test.js
- packages/findings/findings.test.js
- packages/findings/index.js
- packages/findings/lib/atomic-write.js
- packages/findings/lib/atomic-write.test.js
- packages/findings/lib/d1b-002-findings-sleepsync.test.js
- packages/findings/lib/f-3a7c4d67-file-lock-defensive-gaps.test.js
- packages/findings/lib/f-998fb547-core-schema-merge-key.test.js
- packages/findings/lib/file-lock.js
- packages/findings/lib/proac-003-yaml-size-cap.test.js
- packages/findings/lib/rename-with-retry.js
- packages/findings/lib/safe-yaml-load.js
- packages/findings/lib/safe-yaml-load.test.js
- packages/findings/package.json
- packages/findings/reader.js
- packages/findings/review/event-log-loader.test.js
- packages/findings/review/event-log.js
- packages/findings/review/f-8a05fa9d-edit-help-enumerates-fields.test.js
- packages/findings/review/f-find-001-002-write-gates.test.js
- packages/findings/review/featF-intel-001-cli.test.js
- packages/findings/review/featF-intel-001-review-artifacts.test.js
- packages/findings/review/fvr-002-edit-editable-fields-allowlist.test.js
- packages/findings/review/h4-engine-auto-reject-reason.test.js
- packages/findings/review/index.js
- packages/findings/review/proac-001-merge-source-validation.test.js
- packages/findings/review/review-artifacts.js
- packages/findings/review/review-engine.js
- packages/findings/review/review.test.js
- packages/findings/review/stageC-b001-artifact-torn-hint.test.js
- packages/findings/review/stageC-b003-scoped-reset.test.js
- packages/findings/review/transitions.js
- packages/findings/stageC-b002-discover-leaf-guard.test.js
- packages/findings/stageC-b002-finding-torn-hint.test.js
- packages/findings/stageC-c-toplevel-error-envelope.test.js
- packages/findings/stageD-out-001-validate-verdict-first.test.js
- packages/findings/synthesis/apply-recommendation.js
- packages/findings/synthesis/d2b-001-derive-skipped-signal.test.js
- packages/findings/synthesis/dedupe-artifacts.js
- packages/findings/synthesis/doctrine-derivation.js
- packages/findings/synthesis/f-5dfddcb5-prototype-safe-dynamic-keys.test.js
- packages/findings/synthesis/featF-intel-002-preserve-operator-status.test.js
- packages/findings/synthesis/featF-intel-003-apply-recommendation.test.js
- packages/findings/synthesis/findings-a-001-policy-path-traversal.test.js
- packages/findings/synthesis/findings-a-002-slug-collision.test.js
- packages/findings/synthesis/index.js
- packages/findings/synthesis/loaders-skip.test.js
- packages/findings/synthesis/pattern-derivation.js
- packages/findings/synthesis/recommendation-derivation.js
- packages/findings/synthesis/stageC-b001-pattern-skipped-signal.test.js
- packages/findings/synthesis/synthesis.test.js
- packages/findings/synthesis/validate-artifacts.js
- packages/findings/synthesis/write-artifacts.js
- packages/findings/validate.js
### dogfood-swarm
entry points: packages/dogfood-swarm/cli.js
unresolved sites: 5
edges:
- dogfood-swarm → findings (import)
- dogfood-swarm → report (import)
- dogfood-swarm → schemas (import)
- ingest → dogfood-swarm (import)
- schemas → dogfood-swarm (import)
- scripts → dogfood-swarm (import)
truncated within dogfood-swarm
truncated: 19 boundaries omitted
