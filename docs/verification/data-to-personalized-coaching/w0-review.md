# Independent W0 review

Date: 2026-09-17. Scope: ADR-0021, frozen contracts, baseline evidence/reproductions, and development scenario design. Review is independent of the artifact authors. Runtime implementation of W1 and later packages is not required to pass W0.

## Findings at first review

1. **Important — feedback transport/storage dispatch is not yet concrete.** `contracts.md` introduces `feedbackVersion: 2`, but the existing route writes `p_feedback.schemaVersion: 1` (`app/api/coach/sessions/[id]/complete/route.ts:65`, `:83`) and the winning RPC accepts only schema version 1 (`supabase/migrations/20260904023000_fix_atomic_session_workout_link.sql:64`). The RPC freezes `p_feedback` in `completionRequest` (`:193`) and compares that request exactly on replay (`:212`). Without an explicit mapping, independently implemented API/SQL/readers could reject all nullable feedback or break old receipt replay by adding default/provenance fields. Freeze a dispatch matrix and payload examples. Keep outer atomic `contractVersion: 2`; map explicit API feedback v2 to persisted schema v2; reject conflicting/unknown discriminators; leave old v1 replay payload shape intact. Version-aware stored readers must inspect persisted schema v2 rather than relying only on a new transport key. Caller-supplied provenance must not grant confirmation authority.

2. **Important — W3 shared intent shape is underspecified.** `contracts.md` names validators and semantic requirements but does not freeze the actual `PlanningIntentV1` object, priority representation, outcome support/baseline states, confirmation/supersession references, or snapshot discriminator. Independent API, SQL and planner owners would need to invent them. Add a minimal discriminated shape or exact typed example reusing `TrainingGoal`, bound outcomes to eight, state allowed kinds/protocol bindings, and define unknown/unsupported baseline handling. Pin which old plan schema versions remain readable and which new optional field carries intent; no blanket shared-version bump should invalidate accepted JSON.

3. **Moderate — development counterfactual includes contradictory derived state.** In `development.json` scenario `dev-signal-02`, changing only `measurementProtocol` to the matching protocol retains `baselineStatus: not_comparable`, but expects the gap to resolve. Remove the stale derived fact or define which raw binding is authoritative and derive comparability. Do not train/test a rule to ignore a contradictory explicit status without a contract. The protocol strings are abstract fixture names rather than current catalog IDs; document that adapters must map them to catalog protocol plus distance/environment, without claiming current executable support.

4. **Pending artifact — held-out preparation and fixture validation were not yet present.** At first review only development.json/contracts.ts existed. W0 needs 30 distinct development and 12 separate held-out scenarios across the three recommendation rules, plus metadata/validation evidence. Holdout content need not be shown to this reviewer; structural counts, distinct IDs, rule coverage and author-inspection limits suffice for W0. Do not call inspected cases unseen or qualified-coach labels.

## Confirmed strengths and acceptance boundaries

- ADR-0021 preserves canonical ownership, explicit acceptance, immutable historical snapshots, additive migrations, default-off server flags and qualified numerical review gates. The number avoids existing experimental collisions through ADR-0020.
- Baseline report identifies five executable function reproductions and three source-only observations, with appropriate synthetic/mock limitations. The opt-in defect suite prevents old defects from becoming desired regression assertions. It does not overclaim SQL, browser, production, athlete-effectiveness or bench-to-squat runtime proof.
- All eight requested baseline concerns appear in the evidence matrix. Source-only reproduction is acceptable for this W0 source/test baseline; package regressions must later prove changed behavior at the affected executable boundary.
- Development scenarios cover all three recommendation rules, including multiple-goal boundaries, unknown feedback, typed legacy RPE, immutable plan preferences, stale wearable state, partial logs, corrections and tenant isolation. Expected and forbidden assertions are engineering semantics, not model scoring or physiological validation.
- The reuse audit identifies compatible source modules, dirty-source hashes, migration replacement order, numerical exclusions and current preference semantics. It does not claim old experimental checks passed against this implementation.
- Frozen recommendation concurrency prose correctly includes lease token, source and response revisions, policy/capability/date validity, immutable decisions, interaction-triggered refresh and computation/source-save independence.

## Review verification

Read the artifacts and compared dispatch, replay, intake, goal and evidence contracts with current source. No runtime code or historical experiment was edited. This review did not rerun the author's reported 117-test baseline command.

## Recheck

- Finding 1 resolved: contracts now explicitly map API feedbackVersion 2 to persisted schemaVersion 2, reject conflicts, preserve original v1 request shape, verify observation provenance bindings, and prevent a non-atomic downgrade.
- Finding 2 resolved: contracts now freeze the bounded PlanningIntentV1 shape, independent priority order, baseline reference, capability, server confirmation and ownership. Follow-up source review found existing TrainingGoal stores metric/protocol only under non-null numeric target (`adaptive-programming-contracts.ts:542`). The revised contract now includes independent nullable measurement metadata; supported measurable target-less goals require it, numeric targets must match it, and domain defaults cannot fill the binding.
- Finding 3 resolved in latest development data: dev-signal-02 no longer carries a contradictory baselineStatus. Rule names now match the frozen contract.
- Finding 4 resolved structurally: `node test/fixtures/personalized-coaching/validate.mjs` independently passed for 30 development scenarios (10 per rule), 12 held-out scenarios (4 per rule), 42 distinct synthetic athletes and one changed field per counterfactual. This executed integrity validation, not application behavior. Held-out content was not displayed to this reviewer. Development SHA-256: `32f437b53ab35f2b7c2f8ed50f5b2a6ed969b84fac9e7cc880d6a6c7441cc278`; held-out SHA-256: `ea26eb6d3c6fc288330826ec906c288c61566f82f3a7eb2aa7e3a18afc10bc24`.
- `git diff --check` passed. A line-ending notice for the decision index was informational.

**Disposition: W0 review passes.** No important unresolved findings remain in the reviewed W0 artifacts. Contracts are concrete enough to start W1 and W3 in parallel with one migration owner. Runtime compatibility, authority, migration-chain, race and visual checks remain acceptance work for their respective packages; this review does not imply core-ready or numerical-ready status.
