# Owner-pilot WHOOP timing preparation

Baseline PR97 merge4929966916a286dbf8e4d867a9c836071c4e94fd, isolated branch codex/recovery-timing-owner-prep. Existing PR97 receipts/read child5.1 remain accepted. Parent5 remains open. Greg clarified other users are inactive; no inactive-user records/accounts were inspected or changed. Source code shows connected inactive accounts remain eligible for the unchanged scheduled sync because there is no activity filter.

This child prepares only the exact additive SQL, fixed server feature filter, complete-provider-snapshot mapper, homogeneous upsert integration and synthetic tests. SQL is intentionally outside automatic migration paths. See `docs/proposals/recovery-timing-owner/approval-scope.md` for exact fields, date policy, ordinary existing-ID re-ingestion, global DDL visibility/locks, other-user legacy equivalence, rollback and the smallest later production decision.

No production migration, merge, push/PR/deployment, manual sync, provider/token call, athlete write, account/job change, permission/credential/settings/dependency change or later slice is authorized by preparation. Only disposable synthetic PostgreSQL and stubbed adapters may execute candidate behavior. The actual owner's private positive gate binding receipt stores the source hash/digest and result without the raw UUID; independent review must distinguish inspecting that receipt from reproducing real-owner identity.

Independent pre-candidate oracle lives in the authorized task workspace as recovery-owner-ingest-independent-oracle-2026-10-19.md. Frozen review/probe/mutation receipts must bind exact candidate bytes. Hosted lock/PostgREST/schema-cache behavior and actual future owner sync persistence remain later release proof, not local test claims.
