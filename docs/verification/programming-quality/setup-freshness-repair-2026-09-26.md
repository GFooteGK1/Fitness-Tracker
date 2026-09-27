# Setup freshness repair: local verification

Task: `Fitness-Tracker-i40.3.7`. Local implementation and independent review are
complete. At this original verification checkpoint, the repair had not been
committed, pushed or deployed. The completed
PR84 release remains separate. Hosted follow-up is `Fitness-Tracker-i40.15`.

## Behavior verified

Rolling proposals now retain the IDs, versions, content and lifecycle of the
canonical setup records actually read. Verified absence has an explicit null;
missing legacy metadata cannot authorize first acceptance. Initial and conversion
requests check that saved setup agrees with the supplied profile. Stored reviews
retain their original bindings rather than receiving fresh authority.

The additive SQL guard rejects setup that expires or becomes overdue after a
proposal was created, even if the context revision does not change. A source
that was not current when read cannot gain authority merely by waiting. The
existing training-intent guard remains separate. Pending readback withholds stale
acceptance and flags affected reviews; accepted history and response-loss replay
remain unchanged.

Independent review found and the implementation repaired an additional recovery
gap: current-revision legacy reviews and conversion drafts could otherwise prevent
their own replacement. Successor review eligibility and pending-window cleanup now
recognize unknown or expired bindings without requiring an unrelated source write.

## Verification

- Broad local regression: **62 files / 736 tests passed** across `test/coach`,
  weekly API tests and the context-revision database suite. Command:
  `node node_modules/vitest/vitest.mjs run test/coach test/api/coach-weekly test/database/coach-proposal-context-revision.test.ts --exclude 'output/**' --reporter=dot`.
- Three additional final wiring cases were added afterward; their focused suites
  passed **19 tests**. They check expired pending GET/readback, missing or expired
  stored-review receipts before RPC, and exact saved-receipt propagation.
- The database suite passed **27 tests**, including actual saved-source bindings,
  reconciled schedule expiry, each required setup key, canonical preferences,
  accepted replay, future activation, foreign-owner binding rejection, legacy
  review succession and same-window conversion recovery. The helper suite passed
  **11 tests**, including the real complete-intake memory-write contract.
- Independent review passed **67 tests / 5 files**, verified that the replaced
  review RPC changes only successor eligibility, and found no remaining material
  defects. Helper execution privileges remain revoked; the fixed search path and
  one-second RPC lock timeout remain intact.
- Final TypeScript, focused ESLint, script syntax and whitespace checks passed.
  Early verification caught test fixture typing issues and a PGlite timestamp
  representation mismatch; those were corrected before the passing checks.
  Retained historical tests under `output/` are excluded from current regression
  claims. No held-out content was read by the implementation or code reviewer.

Migration integrity (SHA256 of local file bytes):

| Migration | SHA256 |
| --- | --- |
| Existing context revision, unchanged | `0a2983e79dfbfc7dada724d3af80916b74b61f50e4e0ee32056e5b7dd694f58f` |
| Existing write pause, unchanged | `6c336015b78142da07a091d9f999d7019c13d9ec819064cfd4b82ee16d48a041` |
| New setup bindings | `6e7cf5a3ca5598bb9cde81cb11452db3d0ebe5316bbcdd78226ade7362875b8b` |

## Remaining boundary

These are isolated local PostgreSQL, route and unit checks. No new hosted SQL,
multi-session contention run, deployment, production write, or numerical-policy
activation occurred. `initialDosePolicy` remains false. P2 still depends on P0
adjudication and generated-response quality evidence; closing this repair does
not close the broader package.

[ADR-0030](../../decisions/ADR-0030-coach-setup-memory-freshness.md) records the
source-binding contract and future coordinated rollout requirements. The new
migration intentionally rejects old writers and unbound pending records. A future
release must coordinate compatible application and migration changes; a rollback
of application code alone is insufficient. The local bootstrap generator includes
the migration, but this turn did not execute that bootstrap against a database.
