# Reviewed proposal preparation and transaction design

September 27 Chicago / September 28 UTC. `Fitness-Tracker-u5l.6.11` remains in progress.

`reviewed-proposal-registration.ts` now prepares a detached server-owned packet
from an ID-only selection against the trusted week registry. It preserves exact
compiled intent and ordered session prescriptions, full authenticated dependency
binding, source revision, setup bindings and catalog/policy versions. A second
source read must match the compilation. A real revision row and final owner check
are required; absent revision zero is not sufficient for SQL's existing fence.

The packet includes the existing top-level `training_intent` field when present,
so SQL's confirmed-intent guard cannot silently skip the reviewed profile. Its
content fingerprint is stable across unchanged reads. Its exclusive validity
deadline is the earliest future confirmed-memory lifecycle transition or next
athlete-local midnight using the explicit raw timezone offset. This bounds
clock-only source changes without inventing a training-duration policy.

This is implemented preparation only. No registration write, RPC, migration,
acceptance, route, or numerical activation is added. The returned packet explicitly
has `persistable: false` and `numericRuntimeEligible: false`. Post-read races still
require the transaction described below. The broader task is not closed.

## Verified evidence

- 141 tests passed across authenticated source/preparation, reviewed rolling
  plans, complete-week compiler and canonical eligibility. Cases include unknown,
  duplicate, anonymous and foreign registrations; absent revision; correction
  between reads; detached authority; local midnight and memory transitions;
  nonempty confirmed-intent bridge and withdrawal.
- Full current-source TypeScript and focused ESLint passed.
- Independent preparation review: no blockers, 94 tests passed. Its requested
  nonempty intent bridge regression was then added and passed in the final suite.
- Real local Auth/PostgreSQL full-week run
  `d1f6f2ad-ef18-4556-b330-338d2902efdd`: 57 checks, five sessions and 105 exact
  latest reports; 250,818 record characters. New checks verify owned packet
  preparation, full plan/revision/fingerprint correspondence, foreign denial and
  correction invalidation. No hosted connection or schema change.
- Receipt: `output/app-quality-release/reviewed-dose-d1f6f2ad-ef18-4556-b330-338d2902efdd/receipt.json`.

## Transaction requirements discovered from current SQL

1. A service-only immutable registration must bind exact content to reserved
   proposal/plan IDs or a protected issuance receipt. Knowing or copying a
   registration ID/hash must not authorize the older caller-content RPCs.
2. Preserve full intent, snapshot, ordered session count/content/dates, metadata,
   direction, window and sequence. Per-child correctness alone misses deletions.
3. Acquire program/base/source locks before the existing revision `FOR SHARE
   NOWAIT` fence. Missing revision rows fail or are initialized before fresh reads.
   Do not insert a revision row while holding reversed source locks.
4. Existing `accept_adaptation_proposal` changes base/target status and active
   pointer before the proposal-status trigger. Put reviewed freshness validation
   before transitions or verify the legitimate post-transition shape explicitly.
   Comparing the old active tuple in that late guard would reject valid acceptance.
5. Verify exact base, revision, memory lifecycle states at the database clock,
   local source day and supported versions atomically. Reject/expire must remain
   possible after drift. Exact accepted replay precedes freshness reauthorization;
   reused request keys with different registrations must fail.
6. The current `idx_training_plan_versions_open_rolling_window` combines proposed
   and accepted uniqueness. It prevents an accepted week from coexisting with a
   same-week swap proposal. Separate accepted/pending uniqueness is needed, while
   keeping accepted content unchanged until explicit acceptance. Preserve started
   and completed execution during a swap; do not duplicate work or silently drop it.
7. Target-window and sequence validation remains required. The current compiler
   takes the accepted profile's date; it cannot silently roll that profile to a
   new week or bypass review merely to fit the older replacement RPC.
8. Reuse protected proposal/acceptance receipts and existing context/setup guards.
   Prove real local concurrency, lost-response retry, stale/forged/foreign denial,
   immutable accepted readback and later correction invalidation before closing.

The remaining SQL and lifecycle work stays under `.11` and parent W5. These are
implementation requirements, not new coaching decisions or production authority.
Board checkpoint delivered/read back at version 75, event
`210f60f7-e5b5-4386-ac44-b6d5c4c3834d`. Canonical `.11` remains in progress.

## Resolved test-fixture errors

The first new test run failed because a persistent mock called its own spy and
recursed, and the timezone test mutated the shared scope fixture. The mock now
returns explicit test authentication and timezone tests clone the source first.
All 141 tests passed afterward; no production logic was weakened to satisfy them.
