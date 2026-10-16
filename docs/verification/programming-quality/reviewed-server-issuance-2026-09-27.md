# Reviewed server issuance — local verification

Date: September 27 Chicago / September 28 UTC, 2026.
Canonical scope: `Fitness-Tracker-u5l.6.11`. HTTP/UI follow-up: `Fitness-Tracker-u5l.6.12`.

## Implemented contract

`reviewed-proposal-issuer-server.ts` composes the existing source preparer, private
registration and authenticated ID-only issuance. A request contains exactly a
review ID, registration UUID and stable request ID; it cannot provide recipes,
source packets, owner identity or activation. Server composition snapshots its
trusted registry before asynchronous work. Authentication precedes lookup and
privileged registration; the owner and activation gate are checked again before
writes. Source reads retain the athlete client and RLS.

`get_reviewed_week_registration` provides authenticated owner-filtered identity
metadata, returning null for missing or foreign registrations. It exposes no
packet or direct table access. Anonymous and service-role execution are revoked.
Only an explicit successful null lookup allows preparation and registration.
Lookup failure or malformed readback cannot become missing-state authority.

Once registration is saved, retries recover its reserved identities without
recompiling changed source, re-registering or requiring the original in-memory
recipe registry. The existing issuance transaction still enforces current source
on first issuance and exact request replay thereafter. Lost responses preserve
the original request; no invocation automatically resends an uncertain mutation.
Known SQL source rejections require review, and known request conflicts require
recovery of the original request. These classifications match exact code/message
contracts; unknown transport, lock and serialization failures retain retry state.
No response claims that an uncertain earlier operation rolled back.

`reviewed-proposal-service.ts` is the application composition. Its registry is
empty and `initialDosePolicy` remains false; the actual default composition is
tested to return disabled before any database or credential access. No route
exposes this seam yet. The local factory configuration is server-owned test
composition, never a client or environment activation switch.

## Local database evidence

Applied additive `20260928060000_reviewed_registration_recovery.sql` once to the
existing synthetic loopback database, after independent SQL/ACL review.
No reset, bootstrap, replay or fixture deletion.

- SHA256: `A1CE5FE0CBBE7D81DA2C20DDD991DDD8BA863CA9E2F048E7707717E99B463B41`.
- Apply log: `output/app-quality-release/reviewed-set-migration-53eeef7d-6548-4a37-97b0-cac108020a38.log`.
- Final receipt: `output/app-quality-release/reviewed-proposal-1c225575-f6e7-433a-a84c-e35d48dc399f/receipt.json`, **236 checks passed**.
- Intermediate receipt `7ca8beb1-d271-49a2-b15d-5e211a179e6d` passed 227 checks,
  before the explicit source-rejection classification/counterfactual was added.

Final checks include real registration and issuance response loss: wrappers
discard the response only after successful real RPC completion. Recovery uses an
empty registry and a service factory that throws if invoked. There is one saved
proposal, one registration attempt, exact post-acceptance issuance replay, owner
isolation, metadata-only readback and rejection of changed review/request IDs.
Concurrent server calls recover one proposal. A source change after registration
returns review-required and leaves zero proposals for that fixture. Previous
transaction, acceptance, carry-forward and adjacent-week checks still pass.

## Verification and closure

- **141 tests across four focused suites pass**: issuer, authenticated source,
  date transition and execution continuity; issuer suite contains 30 cases.
- Full `npx tsc --noEmit --incremental false` and scoped ESLint pass. The initial
  incremental typecheck hit EPERM writing existing `tsconfig.tsbuildinfo`; the
  nonincremental check verifies types without modifying that cache.
- Independent final reviewer reran **117 issuer/source tests**, inspected the
  final receipt/assertions and migration hash, and found no material blockers.
  Reviewer performed no database writes.

Together with the prior preparation, transaction, continuity and next-week
records, this satisfies `.11`'s local server registration/current-source atomic
acceptance scope. HTTP/UI issuance, actual-set capture/correction/completion,
reload/retry UX and local browser verification remain `.12`. W5, W10 and broader
programming gates stay open. No hosted verification or activation is implied.
All implementation remains local/uncommitted; no deployment, commit or push.
