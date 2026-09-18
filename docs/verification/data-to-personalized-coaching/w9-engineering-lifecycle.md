# Frozen development lifecycle materialization

`test/database/engineering-lifecycle.test.ts` executes the base and counterfactual facts for `dev-nutrition-08` and `dev-nutrition-09`. All **4 cases pass**. The helper consumes the immutable development facts and returns actual database/service/client results. Expected decisions are read only by the assertion layer. No heldout bodies were read or changed.

The helper applies the actual migration chain through W7, uses authenticated owner transactions and a PostgREST-shaped SQL transport adapter, and calls the application capture service, reconciliation service, recommendation service, and client uncertainty gate. Historical target-table grants omitted by the extracted SQL fixture are supplied explicitly, as in the existing recommendation journey fixture. This does not change application schema or production grants.

| Frozen facts | Materialized action | Actual result |
| --- | --- | --- |
| Nutrition 08, revision 1 | Save the stated canonical calories and target, publish a decision, explicitly confirm bounded coverage | Ready factual remainder, canonical/source revision 1, valid bounded coverage |
| Nutrition 08, corrected revision 2 | Amend the original canonical meal through its audited RPC, preserving the stated calories; read without refresh | Revision 2, invalid coverage, no visible stale decision, refresh pending |
| Nutrition 09, photo queued | Keep the stated photo estimate in an offline queue and query canonical meals | One canonical meal, 900 logged calories, zero submitted photo requests, 1200 remaining against the stated target |
| Nutrition 09, save unconfirmed | Freeze the original child request; lose transport both before commit and after commit; reconcile its ledger and retry that same child | Guidance withheld in both branches; read-only reconciliation writes nothing; retry produces one photo meal, stable operation/receipt replay, 1400 canonical calories and ready guidance afterward |

The unconfirmed-save case proves the boundary between server knowledge and client knowledge. Before commit, the server may truthfully return its old canonical totals as ready. After a committed response is lost, the source trigger makes that old publication pending. The actual `hasUnreconciledCapture` and `mayPublishRecommendation` functions hide guidance in both cases until the original request is reconciled. Neither branch treats a lost response as proof that nothing was written. A retained confirmed receipt does not keep guidance hidden after recovery.

Frozen wall-clock coverage is mapped to the actual database day using a valid raw timezone offset, with the reported coverage time thirty minutes before the simulated local current time. This preserves the `18:00` report bound without pretending PostgreSQL still runs on the fixture's original date. The two cases specify calories only; unrelated required target and meal macros are explicit zero fixture fields, not inferred nutritional advice. Source identities become isolated synthetic UUIDs while request/source-item identities remain stable within each replay.

Validation: `npx vitest run test/database/engineering-lifecycle.test.ts` **4 passed**; `npx tsc --noEmit` passed; scoped ESLint passed. Development fixture SHA256 remains `32f437b53ab35f2b7c2f8ed50f5b2a6ed969b84fac9e7cc880d6a6c7441cc278`. The ignored machine-readable report is `output/app-quality-release/personalized-coaching/development-engineering-lifecycle-report.json`.

This is synthetic engineering evidence. It is not qualified-coach validation, a hosted PostgREST test, or physical-device offline evidence. The helper intentionally writes isolated SQL sources; it must not be described as the pure adapter's unchanged-source read test. No runtime SQL changed, so existing separate-connection race evidence is unaffected.
