# Reviewed proposal presentation and recovery

Date: September 27 Chicago / September 28 UTC.
Tracker: `Fitness-Tracker-u5l.6.12`, still in progress.

## Implemented behavior

The gated proposal page discovers only server-owned review IDs for the owned
program's active base. Issuance still validates the full trusted source packet;
discovery grants no numerical authority. Saved proposals remain discoverable
without a live registry entry, including accepted or stale proposals.

Owned detail GET binds proposal, program, registered reserved IDs, proposed plan,
base plan, original request key, dates and sequence. It checks revisions, owner
and proposal/program stability around readback. Full target prescriptions and
both reviewed and standard base formats are retained for comparison. Final
source/memory/execution acceptance checks remain inside protected SQL.

The athlete explicitly prepares, reviews and accepts a week. Both issue and
acceptance requests are persisted before POST with exact IDs and payloads.
Response loss/reload retries reuse those identities. A matching confirmed result
is archived before pending state is cleared. Account changes, corrupt storage,
archive failures, mismatched responses and rejected requests preserve pending
state. Confirmation survives an optional refresh failure. Acceptance uses the
proposal's original saved idempotency key; it never generates a replacement key.

The shared reviewed-week display suppresses workout logging links for unaccepted
proposals and comparison views. The active-week view retains its existing logging
links. Proposal navigation is shown only with the reviewed capability enabled.

## Verification

- 139 tests pass across 11 focused suites: proposal state/pending/UI, existing
  session state/pending/resolution/UI, route/HTTP, weekly readback and shared view.
- Full `npx tsc --noEmit --incremental false` and scoped ESLint pass.
- Independent review: final 30 tests pass; no unresolved findings in this slice.
  The standard-to-reviewed comparison initially lost its standard base. The
  discriminated base-week union and full existing session rendering fixed it,
  with server and DOM regression coverage.
- Real loopback Auth/PostgREST/PostgreSQL: **312 checks pass**, receipt
  `output/app-quality-release/reviewed-proposal-ce505a56-7022-4007-b244-dcc9c876b121/receipt.json`.
  New checks prove review-ID discovery, full base/target detail, accepted reload
  and foreign-owner denial against actual storage.
- The lost-response/reload DOM test covers issuance and acceptance sequentially,
  preserving exact bodies and requiring explicit acceptance. DOM transport is
  mocked; the real DB harness invokes Request/Response handlers directly.
  Neither establishes actual network/browser lifecycle proof.

An early unit test incorrectly treated a newly minted valid proposal ID as a
known-ID mismatch for issuance. Issuance does not know that ID in advance; the
test now checks mismatched program identity. Typecheck also caught a union-spread
test fixture; preserving the union while changing its request key fixed it.
Final checks above pass; no unresolved failure cycle.

## Remaining work and boundaries

Permanent proposal rejection recovery still preserves/blockades the original
request. Before offering replacement, add explicit atomic resolution that fences
late registration/issuance/acceptance attempts and safely retires an unaccepted
proposal while preserving its evidence. Do not clear based on an empty read or
HTTP rejection. Then prove the full browser lifecycle over actual local transport
and local Auth/PostgreSQL, using trusted synthetic server composition without a
production enable switch. W10 and broader QPlan gates remain open.

Default production registry remains empty and `initialDosePolicy` false. No new
migration, hosted writes, cutover, activation, commit or push in this slice.
