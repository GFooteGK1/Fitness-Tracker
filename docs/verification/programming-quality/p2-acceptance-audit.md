# P2 evidence and shared-context acceptance audit

Date: 2026-09-21. Scope: `Fitness-Tracker-i40.3.3`, accepted programming-quality QPlan. This audit uses current local source and tests, not historical test counts as proof of completion.

## Verdict

P2 remains incomplete. The audit repaired bounded ownership, coverage, request-contract and accepted-readback gaps. It also identified explicit remaining work in field provenance/exclusions, older performed history and confirmed-outcome selectors. Neither passing contract tests nor the GPT reference conversations establish better physiological programming.

## Acceptance evidence

| P2 requirement | Current evidence and limit |
|---|---|
| Relevant counterfactuals change decisions | `weekly-review.test.ts` exercises comparable/incompatible observations, repeated versus isolated session signals, pain precedence and changed intent. The real evaluator/compiler API schedule case changes the replacement while preserving the accepted week. Numerical-policy and model-quality judgments remain separate. |
| Partial logs do not imply low capacity | `performed-work-context.test.ts` and `performed-dose-evidence.test.ts` retain exact/bounded/unknown quantities, unconfirmed execution and omissions. Socius prompt prohibits aggregate-to-max and missing-history-to-low-capacity inferences. This is input/prompt evidence, not a model-output evaluation. |
| Actual values and exclusions reach chat | Evidence projection/tool tests preserve measured values, units, protocols and whole-record omissions. Shared saved review preserves evidence summaries and exclusion reasons. Fresh-packet field provenance and general exclusions still need work in `i40.3.4`. |
| Current intent and corrections are respected | Direction reconciliation, source revision and database suites cover owned latest intent, blocked/confirmed replacements, inserts/corrections/deletions, stale draft rejection and immutable accepted replay. Clock-only expiry of all setup memory is not transactionally fenced. |
| Chat and Program explain the same saved decision | Readback parity now includes the active-base transition after acceptance. `acceptedOrigin` preserves the prior review as history, including corrected source status; it cannot create a current recommendation or acceptance control. |
| Ownership is enforced | Query filters, defensive packet/projection ownership, tool input rejection and local PGlite RLS/ACL tests exist. This audit fixed foreign observation/workout IDs in execution exclusion metadata. Hosted RLS and real multi-session contention remain unverified. |
| Purpose retrieval and coverage are inspectable | Tool exposes five validated purposes. Memory overflow is now explicit even below the source-query cap. Targeted weekly review request validation is exercised rather than hidden behind a mocked packet. Older performed records and confirmed outcome IDs still require the work below. |

## Fixed findings

The evidence assembler built execution exclusions before applying ownership filtering. A foreign linked observation could disclose IDs in audit metadata even though its measurements were excluded. The regression reproduces this boundary and now verifies no foreign IDs appear in the serialized packet.

Memory selection could normalize more than its configured limit and then silently slice it, reporting complete selection. Eligible-memory overflow now sets selection truncation and a named missing reason. Invalid, foreign and ineligible rows do not count as omitted eligible memories.

The accepted-origin gap occurred because an originating review is bound to the prior plan, while both runtime and weekly GET request the new active base. The additive historical origin follows the accepted proposal relationship without changing current recommendation semantics. Tests cover corrections, different current reviews, identity mismatches, read failures, ownership, immutable input, UI action suppression and chat/API parity.

The targeted weekly path requested `adaptation_review` without its required goal ID. The real request validator rejects that request; previous route mocks hid the mismatch. Bound confirmed outcomes now use a valid `new_planning` request with the requested window and its existing 80-sample cap. The targeted evaluator derives an adaptation view only after exact outcome binding. It retains source limits, completeness, active-plan identity and original retrieval reproduction. Legacy plans without confirmed intent retain the original goal-scoped request.

## Remaining scope, owned by Beads

| Issue | Concrete gap and next acceptance evidence |
|---|---|
| `Fitness-Tracker-i40.3.4` | Observation value provenance is fetched but not projected. Oversized comparison or memory provenance can become an empty object silently. Fresh packet filters generally omit reasons for excluded sources. Retain bounded provenance and explicit owned exclusion/omission accounting, with whole-record and cap tests. |
| `Fitness-Tracker-i40.3.5` | Performed-work retrieval stays at 28 days; widening evidence-tool windows does not retrieve older canonical workout logs. Workout-level effort is not selected by the shared reader. Add deliberate bounded older retrieval and preserve effort as session-scoped evidence. |
| `Fitness-Tracker-i40.3.6` | Adaptive scope resolves allocation goal IDs rather than distinct confirmed outcome IDs. Verify and support explicit confirmed-outcome selectors with exact metric/protocol binding and no widening for unknown/foreign IDs. |

P0 adjudication remains outstanding. Greg is already assigned to review the six synthetic signal cases and existing research; no reviewer reassignment or threshold invention is needed. Broader strategy, fixed VBT sets, prescription operations, numerical qualification and hosted activation remain P1/P3–P6 work, not substitutes for closing these P2 contracts.

Subsequent local implementation addresses all three identified evidence tasks;
see the [completion receipt](p2-evidence-completion.md) for the new behavior and
verification. This audit remains the record of what was missing when inspected.
P0 adjudication and final P2 package acceptance remain outstanding.

## Verification boundary

Final combined regression: **515 tests across 32 files passed**. Full TypeScript and focused ESLint passed. Independent review of accepted-origin behavior passed 148 tests across five related files and found no blocker; a separate review passed 80 projection/readback tests. Independent review of the evidence-assembler fixes passed 66 focused tests. Independent targeted-request review passed 62 tests across four suites and found no blocker. Its route regression uses the real request validator, assembler and weekly evaluator with synthetic source rows but no observations; populated binding/progression behavior is covered separately by existing targeted evaluator tests. Whitespace verification passed.

Tests use synthetic fixtures, mocked owned rows and local PGlite. No live athlete mutation, hosted migration, deployment, paid/model call, commit or push occurred. Browser behavior is tested through components; no visual browser QA was performed. `initialDosePolicy: false` remains unchanged. The original 24-case baseline and its source fingerprints are retained as historical evidence.
