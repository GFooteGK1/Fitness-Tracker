# W6 independent application review

Status: **PASS after corrections and independent re-review**. Reviewer: `w0_reuse_audit`, reviewing the W6 author's implementation without editing its runtime or test files. Reviewed integrated worktree based on `61d04df9dad3dfe88a9594fff28be06a72899741`. Scope: plan section 5.5/W6, targeted outcome selection, weekly aggregation, execution priority, evidence/API boundaries, compatible stored readers and Program disclosure. Database implementation has its separate independent review in `w6-database-review.md`.

## Resolved important findings

1. **A measurement family could inherit a numerical policy without an adapter.** The first implementation of `evaluateConfirmedOutcome` replaced an existing direct requirement with any supported same-domain catalog measurement while retaining the numerical evaluation policy. A fixed-load velocity outcome could inherit repetition-max progression eligibility. The repair at `app/lib/coach/targeted-review.ts:74` requires the existing direct requirement's exact metric and assessment, plus the current catalog definition/protocol versions. Unsupported adapters return hold/collect with `outcome_policy_adapter_unavailable`, never a dose. Regression: `test/coach/weekly-review.test.ts:589`.

2. **Safety action precedence erased independent attainment.** Per-goal attainment originally used `evaluator.action === 'maintain'`. Compatible direct values 100, 101, 105, 106 against an at-least-105 target became unattained when concerning pain selected pause. `app/lib/coach/adaptation-evaluator.ts:377` now exposes the existing goal-met calculation independently; `weekly-review.ts:192` uses that result while keeping pause authoritative. Regression: `test/coach/weekly-review.test.ts:594`.

3. **Distinct allocations hid a shared demand.** Aggregation originally checked equal allocation IDs or overlapping assignment IDs, although exact assignment matching already filters by allocation. Strength and hypertrophy outcomes bound to the same bench movement could therefore be treated as unrelated when one lacked evidence. `targeted-review.ts:126` and `weekly-review.ts:207` now also compare exact movement or existing catalog coverage tags. This only adds a qualitative hold; it cannot authorize a numerical tradeoff. The strength/hypertrophy same-movement regression verifies `shared_demand_conflict`, null dose and distinct allocations.

4. **Stale review presentation depended on the new-writer flag and a truncatable source list.** Weekly GET originally skipped invalidation reads when targeted review was disabled and selected at most 512 source invalidations across displayed reviews. Repeated invalidations could obscure another review, and a pending proposal's review could fall outside the 16 displayed records. `app/api/coach/weekly/route.ts:90` now performs bounded per-review existence reads, includes the pending review ID, and preserves source validity checks with the flag off. Any read error fails closed. Regression: `test/api/coach-weekly.test.ts:135`.

The first independent test run also exposed an outdated weekly GET mock after source checks became active. The fixture now includes the invalidation table; the complete rerun passed.

## Confirmed behavior

- Outcome evidence requires matching metric, direct semantic role, assessment definition/version, protocol/version, movement, variation, distance, equipment, repetitions/load/duration and technique/environment context. Supported unit normalization does not invent absent values. Existing source comparability prevents pooling incompatible exposure series.
- Every active confirmed outcome gets its own review, sources, missingness, attainment and disposition. Existing safety rules take precedence. Unspecified competing priorities and unresolved shared demands hold; missing evidence for an unrelated outcome can coexist with an unchanged continuation. One goal's attainment does not mark other goals or the event attained.
- A numerical change requires one exact observed movement and coverage assignment. Broad domain evidence, an unrelated sorted assignment, or multiple matching assignments cannot silently select a target. Existing bounded policy and whole-week validation remain authoritative. No new gated load-trial or history-derived dose rule is activated.
- Explicit feedback eligibility remains separate from legacy defaults. Current owned workout capture/execution revisions are read before selecting linked evidence; missing/amended/deleted sources are excluded and revision-read failures make the packet unavailable. Review writes persist exact observation/value and execution references; database guards handle races after application reads.
- Execution priority is confined to a confirmed leading strength movement. Stable topological ordering respects mandatory sequencing. Final realization verifies work order, preparation, role and exact movement, with blocked/unavailable states; compiler validation retains dose/time constraints. Tests preserve the coverage schedule when ordering changes and reject conflicting mandatory order.
- Accepted direction/profile/intent snapshots remain the basis of continuation. New metadata has explicit version dispatch; legacy omission remains readable. Review/proposal source invalidation preserves immutable history and requires a successor review rather than altering accepted content.

## Independent verification

`npx vitest run` on the following suites: **13 files / 100 tests passed** on the corrected integrated tree.

```text
test/coach/weekly-review.test.ts
test/coach/adaptation-evaluator.test.ts
test/coach/execution-priority.test.ts
test/coach/evidence-context.test.ts
test/coach/evidence-context-fetch.test.ts
test/coach/session-composer.property.test.ts
test/coach/rolling-weekly-plan.test.ts
test/coach/rolling-weekly-plan.property.test.ts
test/program/rolling-weekly-program.test.tsx
test/api/coach-weekly.test.ts
test/api/coach-weekly-review.test.ts
test/api/coach-weekly-stored-review-proposal.test.ts
test/database/targeted-review-sources.test.ts
```

`npx tsc --noEmit`: **passed**. The Vitest run includes local PGlite source/rollback/RLS cases and synthetic DOM/API fixtures. Expected conflict-test logging and pre-existing Vite/deprecation warnings occurred; no assertion failures remained.

No unresolved material finding remains in this reviewed W6 application slice. This is engineering verification, not qualified approval of new numerical coaching policies. Exact assignment ambiguity and unsupported adapters intentionally hold; execution priority is not a general optimizer. No hosted-account, production, provider/model, physical-device, or new browser visual validation is claimed by this review. W9 integration and the separately gated numerical-policy work retain their own acceptance requirements.
