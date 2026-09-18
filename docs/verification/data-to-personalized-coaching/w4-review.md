# W4 independent source review

Reviewer: W3 agent (`w0_reuse_audit`), independently reviewing the W4 owner's source. No W4 runtime edits made by reviewer. Status: PASS after corrections and independent re-review. No unresolved material findings in the reviewed W4 slice.

## Findings

1. **P1: malformed or ambiguous retrieved history can masquerade as complete history.** `planning-context.ts` originally appended `unsupported_blocks` / `ambiguous_block_*` to `missing`, but computed `status` and `retrievalComplete` from `resolved.issues` only. Reproduce with a same-owner completed workout whose `blocks` is `{}`: the builder returned `cold_start`, `retrievalComplete:true` and an `unsupported_blocks` marker. `applyFactualPlanningContext` then reset recentTraining to zero and allowed a proposal. Mixed `exercises` and `movements` returned `available` while withholding familiarity. Requested explicit partial/unusable classification and regression coverage so malformed nonempty history cannot use complete-empty behavior. W4 owner confirmed and is repairing.

2. **P2: new stored metadata has no version/shape validation.** `programming-schema.ts` originally added `planningContext` and `prescriptionBasis` only as TypeScript properties; `validateProgrammingProfile` did not validate either. An otherwise valid stored profile with `prescriptionBasis:{version:"future"}` can pass the plan reader and `PrescriptionBasisDetails` then dereferences `basis.sourceIds.length`. Requested explicit optional version-dispatched validators and safe rejection of malformed/future metadata while preserving absent legacy metadata. This also needs consistency checks between basis/context/profile, rather than trusting client casts.

3. **P2: history start-date validation comment is incorrect.** `fetchFactualPlanningContext` called `localDateToUTCStart` as date-parts validation, but that utility simply uses `Date.UTC` and normalizes impossible dates. An input such as `2026-02-31` does not get rejected by that call. Current first-direction callers validate their profile dates, so this is a defensive exported-boundary defect, not evidence of a live invalid-date write. Requested explicit YYYY-MM-DD roundtrip validation in the collector.

## Confirmed strengths and scope

- Source reads use explicit same-owner filters. Retrieval, connection failure, missing new columns, and truncation have distinct states. Fallback is limited to missing capture columns, not general database failures.
- Historical selection reads immutable `activity_revisions` at an as-of capture cutoff, filters selected event dates after terminal-revision selection, and includes deleted/moved records. Current mode does not resurrect deleted rows. W2 `capture_snapshot` stores full canonical row JSON, matching the new reader's shape.
- Canonical workout entries use actual `blocks[].exercises[].dose`; legacy logs use `blocks[].movements[]` or the recognized nested blocks wrapper. As-prescribed inference requires matching immutable completion request, owner/session/workout/date/status and unchanged execution/capture revisions. Modified/stopped/amended data does not borrow copied dose ranges.
- Shadow evidence preserves exact/bounded/unknown quantities and source references, unknown legacy origins, scoped effort, units, role and unilateral/protocol/equipment details. No midpoint, weekly dose aggregation, RPE-to-RIR conversion or automatic prescription mutation was found.
- Runtime imports exclude shadow evidence/review. Only eligible reported movement IDs feed the existing session-composer familiarity score; coverage dose arrays stay empty and the numerical policy flag is false. Existing constraints/equipment and explicit movement avoidance remain in force.
- New/changed directions use the refresh helper; ordinary accepted continuations preserve the stored profile. The basis disclosure states provisional existing policy rather than history-derived tolerance. The owner reports 10 files/69 focused tests and tsc passing; reviewer inspected their source but has not rerun the full W4 command yet.

## Nonblocking limitations

The collector queries at most 100 workouts/completions and 400 revisions; a larger replay history fails closed rather than paginating. Outside-training collection remains unknown with no invented adapter. Legacy paths default to UTC unless the caller supplies its raw offset. Same-day similar records remain separate; shadow evidence marks ambiguity rather than deduplicating by name/date. Factual runtime metadata includes no history-derived dose totals. No live-model, production, or authenticated-hosted-account verification is claimed.

## Re-review evidence

All three findings were repaired by the W4 owner. Structural gaps now set `structurallyIncomplete`, return partial and prevent new-direction application. Explicit optional version/shape validators are invoked by the profile decoder, with basis/context source/time and profile familiarity consistency checks; the disclosure also has a defensive shape check. `validDay` now roundtrips through the shared UTC utilities and rejects impossible dates.

Reviewer independently ran the seven relevant suites (planning-history, planning-context-refresh, performed-dose-evidence, prescription-basis-details, planning-intent, rolling-weekly-plan, adaptive-plan): **7 files / 61 tests passed**. `npx tsc --noEmit` passed on the reviewed integrated tree. Source readback confirms shadow modules still have no runtime compiler/prompt import and numerical policy remains disabled. Earlier findings above are retained as resolved review history.
