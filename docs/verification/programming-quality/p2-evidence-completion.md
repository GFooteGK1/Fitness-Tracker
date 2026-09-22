# P2 remaining evidence contracts: local implementation receipt

Date: 2026-09-21. Tasks: `Fitness-Tracker-i40.3.4`, `.3.5`, `.3.6`.

## Result

The three remaining evidence gaps identified by the P2 audit now have local implementations and executable tests. This closes those engineering tasks, not the full programming-quality plan, qualified coaching review or hosted activation.

| Gap | Implemented behavior | Evidence |
|---|---|---|
| Field provenance and exclusions | Observation values retain their own provenance. Oversized or malformed meaningful provenance/comparison omits the affected record and marks selection incomplete. A ledger records owned queried exclusions, counts and overflow rather than silently dropping them. | Evidence assembler/projection tests cover independent value provenance, malformed/oversized fields, valid sibling records, lifecycle/import/protocol/feedback/correction filters, bounded ledger overflow and foreign-ID rejection. |
| Older performed history and effort | Read-only `get_coach_performed_work` requests 1–180 days through the shared canonical reader. Passive/planning defaults stay 28 days. Workout RPE has session scope, source path and provenance; set/movement effort is unchanged. | Real reader/tool test retrieves an August 6 workout with a 60-day request and excludes it from the default September 20 window. Tests cover owner/clock/timezone, invalid options, capability off, provider errors, corrections, raw invalid/unknown RPE, source caps and projection limits. |
| Confirmed-outcome lookup | A confirmed outcome ID resolves independently of allocation IDs against the owned accepted snapshot. Exact metric, assessment version, protocol and binding are required. Original semantic roles are retained; direct-outcome adaptation eligibility is a separate unchanged gate. | Real assembler cases cover variation, repetitions, movement, equipment, version, unknown/foreign/proposed selectors, separate device series, process goals without measurements, unsupported/paused factual outcomes, proxy/training-signal roles and separate VBT metric history. |

## Contract boundaries

Evidence selector algorithm is now `coach-context-selection-0.4.0`; schema version remains 1 with additive fields. The exclusion ledger is explicitly scoped to queried owned records and retains at most 128 entries plus counts/overflow. Database-side filtering and query caps may hide rows before assembly; the packet does not claim an exhaustive ledger of the database. Meaningful record omissions and ledger overflow make selection incomplete.

The performed-work tool accepts only `window_days`. Authenticated owner, server clock and request timezone are not model-supplied selectors. Existing history activation remains required. The shared reader keeps its 100-workout bound, and factual projection keeps its 16,000-character record budget. A broader window can therefore remain partial. There is no pagination or unrestricted historical export in this slice.

Session RPE retains raw source and provenance. Legacy unknown provenance is not upgraded to athlete confirmation, and workout effort never establishes a max-effort set. Literal weight text stays literal. Performed work does not select or authorize a future numerical dose.

Confirmed-outcome retrieval reuses exact measurement/binding matching. It can return a proxy, estimate or training signal as that role, but `sampleMatchesOutcome` still requires direct evidence for the targeted evaluator. A different metric, including VBT for a strength-load outcome, is retrieved separately through metric history. Legacy strength assessments lack reliable protocol bindings and are explicitly excluded from exact outcome lookups; broader and legacy allocation retrieval still expose them with their original meaning. Unknown goal IDs cannot widen either observations or strength baselines. Paused/unsupported goals can expose compatible historical facts without gaining adaptation support. Device preferences are not invented; existing device-specific comparability keys remain separate.

## Verification

Combined regression: **594 tests across 36 files passed**, including the prior P2 suites plus confirmed-outcome retrieval, performed-work tool, adaptation evaluator and adaptation API checks. Full TypeScript, focused ESLint and whitespace checks passed.

Independent history/tool review passed 40 focused tests and found no blocker. Independent provenance/exclusion and targeted retrieval review passed 82 focused tests and found no blocker. Independent selector review passed 52 tests covering the role-preserving matcher and unchanged direct-evidence gate. The final legacy-baseline boundary was additionally reviewed after its regression was added.

These are local synthetic/mocked tests and existing local PGlite transaction tests. No paid or live model evaluation, authenticated athlete validation, browser visual review, hosted migration, deployment, commit or push occurred. The original frozen baseline and signal-report source fingerprints were not regenerated.

## Remaining program-level work

P0 coaching adjudication is still pending, with Greg already assigned to the six prepared signal cases. These changes support the P2 engineering acceptance criteria but do not supply those human judgments or prove better programming. P2's parent remains open for that dependency and final package acceptance.

P1 still needs the reviewed continuity policy/base week and executable monitoring sets. P3 must account for all confirmed outcomes and competing session demands across five feasible sessions. P4/P5 cover reviewed prescription operations and comparative quality; P6 covers separately authorized hosted activation. `initialDosePolicy: false` remains unchanged.
