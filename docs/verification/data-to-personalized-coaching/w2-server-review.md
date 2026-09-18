# Independent W2 server integration review

Reviewer: separate database/fixture implementation agent; this review edits no application files. Scope: `app/lib/capture`, `app/lib/logging/server.ts`, logging status/retry API, capture API and changed logging/meal/agent/PR adapters. Parent implementation is still in progress. UI reconciliation and the draft endpoint were explicitly unfinished when review began.

## Findings

| ID | Priority | Finding | Current status |
| --- | --- | --- | --- |
| SRV-1 | Important | The `saveActivity` correction branch called amendment before setting `writeAttempted`. Lost amendment responses could cause `replayJsonRequest` to classify the request as retry-safe no-write, because the original ledger's entity array did not include the amendment. `beginRequest` returned terminal responses before reconciling mutation receipts. | Parent added mutation-attempt fencing. Database secondary defense now derives committed mutation receipt/entity in `finish_logging_request`, overrides false retry-safe claims, and has a passing executable regression. Final app readback/regression pending. |
| SRV-2 | Important | W2 revokes authenticated canonical UPDATE/DELETE, but feature-disabled meal PUT/DELETE/refine/analyze and agent update paths still use those privileges. Applying the migration with the default-off flag, or rolling the flag back, breaks these existing paths. `/api/capture` currently takes the inverse approach and is ungated. | Reported to parent. Resolve the schema compatibility versus feature flag boundary and test with actual post-migration grants. |
| SRV-3 | Withdrawn | Initial concern about imported catalog values being relabeled as manual label facts in foods/log. | Deeper validation inspection disproved reachability: `parseReviewedFoodRequest` accepts manual_label only. No change required; parent notified of withdrawal. |
| SRV-4 | Moderate | `amendActivity` reads the current canonical row before reconciling a prior mutation. After committed amendment response loss followed by deletion in another tab, the API rejects exact replay although immutable mutation receipt and SQL replay remain available. | Source repair read back: revision-first reconstruction reaches the exact SQL replay even after canonical deletion. Targeted replay/changed-payload regression pending. |
| SRV-5 | Important | `amendActivity` unconditionally marks all quantity/RPE/composition fields corrected, even for notes-only or otherwise partial edits; inferred correction similarly downgrades every field to model-estimated/unreviewed. This can make untouched athlete-reported quantities newly eligible despite no quantity review. | Reported to parent. Derive corrected/inferred field scope from explicit changes/review and preserve untouched provenance; add partial-field regressions. |
| SRV-6 | Moderate | Reviewed-food logging upserts the catalog before meal commit but its failure response omits the saved catalog outcome. A definitive pre-freeze exception can also leave a processing parent with no child, while callers only receive generic uncertainty. | Reported to parent. Preserve/report the successful catalog outcome and distinguish confirmed no-canonical-write failures from unresolved writes. |

| SRV-7 | Moderate | Bundle recovery maps all child errors to save_unconfirmed, including definitive SQL transaction rejects or expired drafts. A frozen pending child has no correction/discard transition; standalone draft editing is prohibited and retry repeats the same invalid/expired payload. | Database fix implemented at parent request: explicit cancel RPC with stable no-write proof, committed-child rejection and replay/partial-state tests. Parent service/API adaptation remains in progress; no transport absence is treated as proof. |

These findings concern W2 server semantics and do not claim UI verification. The implementation owner retains responsibility for all adapter integration and known unfinished client/draft work.

## Verified boundaries

- Coach write authority comes from server-parsed explicit occurrence clauses; model tool output cannot add source identities or directly mutate coaching memories in capture mode. Repeated outputs for one source are collected once before freezing; conflicting payloads fail.
- The operation list freezes before the first canonical write. Bundle commit reuses committed child receipts and returns unresolved children separately. It does not roll back successful children or regenerate their parser output.
- New status/retry requests enforce authenticated expected owner and private no-store reads. Requests without known receipts remain uncertain; absence alone does not prove no write.
- Normalization preserves modeled estimate origin separately from review and discards model PR assertions. Canonical totals and PR projections are SQL-owned. The new check-prs path reads canonical projections instead of trusting stale client blocks.
- Same-owner source references, immutable revisions, program execution amendment, child/parent replay and grants are separately exercised in the database slice. That SQL is the reviewer's implementation, reviewed independently by the parent rather than self-approved here.

## Executed checks

```powershell
npm test -- --root . --exclude '**/.worktrees/**' test/capture/contracts.test.ts test/client/logging-request.test.ts test/api/logging-boundary.test.ts
```

Result: **15 tests passed across three files**. This passing set does not establish that the pending findings are resolved. No providers, live accounts, browser checks or true multi-connection race tests were used in this server review.

## Final repair verification

The table above preserves the findings and intermediate disposition when reported. Final source readback and independent regressions now clear SRV-1, SRV-2, SRV-4, SRV-5, SRV-6 and SRV-7. SRV-3 remains withdrawn. The later SRV-8 finding (lost standalone draft create/discard response was not recognized as a durable outcome) is also repaired and covered. Parent implementation remains responsible for UI and the completion route integration described below.

- SRV-1: the correction boundary marks an attempted write before the RPC. A lost amendment response remains unresolved until the original request reconciles its immutable receipt, without rerunning parsing.
- SRV-2: installed-schema detection selects audited corrections even when the writer flag is off, with fallback only for the exact absent-column response. Explicit Coach correction uses this same compatibility boundary. Existing saved-plus-pending bundles retain their receipts and return paused uncertainty without attempting to finish their unresolved ledger.
- SRV-4: revision-first reconstruction replays the original normalized mutation after canonical deletion; changed replay payload is rejected. The independent service test supplies a deterministic RPC boundary; the separate SQL tests execute actual mutation replay and conflicts.
- SRV-5: notes-only, identity/name-only and partial inferred changes preserve untouched quantity/RPE provenance. Tests distinguish a food name change from macro/portion review and a movement name change from performed quantity review.
- SRV-6: the real catalog route reports its completed catalog save when meal commitment is uncertain. The frozen response retains that catalog result for recovery.
- SRV-7: authenticated DELETE reconciliation validates the request owner and selected child, exposes the stable SQL cancellation proof, preserves saved siblings and does not cancel committed children. Repeated cancellation returns the same proof; a fully canceled request can finalize with confirmed no-write retry eligibility.
- SRV-8: draft create/discard outcomes are recovered from their immutable mutation result; preview drafts are read by original request identity. Recovery does not rerun provider processing or claim a canonical activity save.

Independent tests added: `test/api/capture-recovery.test.ts` (**10 passing**) and `test/capture/corrections.test.ts` (**5 passing**). The tests execute real routes/services with database boundary mocks. They do not replace executable PostgreSQL checks. They initially caught both remaining SRV-2 branches, which were repaired by the implementation owner and rerun successfully.

Final command:

```powershell
npm test -- --root . --exclude '**/.worktrees/**' test/database/capture-receipts.test.ts test/database/logging.test.ts test/database/optional-feedback.test.ts test/database/session-capture-signals.test.ts test/api/capture-recovery.test.ts test/capture/corrections.test.ts
```

Result: **104 tests passed across six files**, including 34 W2 capture database tests. No important finding remains open in the reviewed server/core scope. The new `record_coach_session_capture` completion wrapper is this reviewer's SQL implementation and requires the parent's independent review; its API/UI integration is a separate parent-owned check. No providers, live accounts, true concurrent database connections or UI behavior were verified by this review.
