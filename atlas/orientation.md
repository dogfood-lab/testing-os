◷ numbers as of 2026-09-22 · 0 days ago

## What this is

unnamed: what this repository is
22 boundaries. 22 still unnamed.

If you maintain this repository: where to start, why it was built this way, what you will break.
If you are new here: where to start, why it was built this way, what you will break.

## Map

```mermaid
flowchart LR
n_dogfood["⚙ dogfood · 15"]
n_dogfood_swarm["⌘ dogfood-swarm · 349"]
n_findings["⌘ findings · 81"]
n_ingest["⌘ ingest · 80"]
n_portfolio["⌘ portfolio · 23"]
n_report["⌘ report · 24"]
n_schemas["⌘ schemas · 37"]
n_scripts["⌘ scripts · 63"]
n_verify["⌘ verify · 63"]
more["+ 1 more"]
unassigned["· unassigned · 1"]:::unassigned
n_dogfood --> n_schemas
n_dogfood_swarm -.-> n_findings
n_dogfood_swarm --> n_findings
n_dogfood_swarm -.-> n_ingest
n_dogfood_swarm -.-> n_portfolio
n_dogfood_swarm -.-> n_report
n_dogfood_swarm --> n_report
n_dogfood_swarm -.-> n_schemas
n_dogfood_swarm --> n_schemas
n_dogfood_swarm -.-> n_verify
n_findings -.-> n_ingest
n_findings --> n_ingest
n_findings -.-> n_portfolio
n_findings -.-> n_report
n_findings -.-> n_schemas
n_findings --> n_schemas
n_findings -.-> n_verify
n_findings --> n_verify
n_ingest --> n_dogfood_swarm
n_ingest --> n_findings
n_ingest -.-> n_portfolio
n_ingest -.-> n_report
n_ingest -.-> n_schemas
n_ingest --> n_schemas
n_ingest -.-> n_verify
n_ingest --> n_verify
n_portfolio --> n_findings
n_portfolio -.-> n_report
n_portfolio -.-> n_schemas
n_portfolio -.-> n_verify
n_report -.-> n_schemas
n_report --> n_schemas
n_report -.-> n_verify
n_schemas --> n_dogfood_swarm
n_schemas -.-> n_verify
n_scripts --> n_dogfood_swarm
n_scripts --> n_findings
n_scripts --> n_ingest
n_scripts --> n_portfolio
n_scripts --> n_schemas
n_scripts --> n_verify
n_verify --> n_schemas
classDef unassigned stroke-dasharray: 4 3
```

[+ 1 more](atlas/dev.md)

## Legend

────────▶   import        one boundary statically imports another
────────▣   chunk         same, recovered from a bundle; boundary grain, file unknown
· · · · ·   co-change     changed together, no import; width = strength
────────▶   low confidence: same shapes at 40% opacity; ⚠ and the words at full contrast

## Where to start
1. OPEN packages/schemas/src/index.ts
2. RUN npm test
   passes when: exit 0
3. BREAK Changing this breaks dogfood, dogfood-swarm, findings, ingest, report, scripts, verify; covered by tests in schemas (derived)
   tests that cover it: not covered by any test boundary

## What you will break — schemas

◷ numbers as of 2026-09-22 · 0 days ago

confidence: full

| relationship | boundaries |
| --- | --- |
| imports & co-changes | dogfood-swarm · findings · ingest · report · verify |
| imports only | dogfood · scripts |
| co-changes only | portfolio · root |

## Still unnamed
22 still unnamed. 1 unassigned file.
atlas/boundaries.yaml
