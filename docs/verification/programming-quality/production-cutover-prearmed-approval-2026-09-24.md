# One pre-armed create/accept attempt

**Proposed only. Coaching is paused at generation 3.** The same synthetic account
now has its profile, session and context revision zero. No program, proposal or
prescribed session exists. The [latest result](production-continuation-result-2026-09-24.md)
records the completed provisioning and paused rejection, the local timing stop,
and verified containment. Both migrations and the approved build remain installed.

## Exact proposed continuation

1. Refresh the pinned deployment, all three aliases and 31 bindings, schema/ledger
   identities, paused generation 3, synthetic owner scope and original fixed-plan
   hashes. Require the previously observed profile and revision-zero rows only.
2. Start the reviewed pre-armed operator while paused. It authenticates and
   decrypts the existing account/session/evidence, verifies the frozen inputs and
   exact prior freshness failure, prepares requests/cookies, and saves a distinct
   one-shot marker before reporting READY. Require sufficient session lifetime
   for its five-minute wait plus execution; no automatic refresh or sign-in.
3. Prepare the separate generation-checked re-pause connection. Resume once from
   generation 3 to 4. In one browser-control invocation, run the independent
   committed-state read, validate open generation 4 and publish the new attestation
   immediately. Do not insert a model/tool round trip between read and publication.
4. The ready operator validates the same 15-second freshness bound immediately
   before its first HTTP request. Create and accept the same frozen three-session
   proposal using the original key. Preserve durable response capture, the
   15-second request deadlines and 30-second shared create/accept budget.
5. Immediately re-pause from generation 4 to 5 after acceptance or any error.
   Start within 60 seconds of the open readback; target independently verified
   closure within 90 seconds. Real athletes can write during the open interval.
6. Only after successful acceptance and verified closure, capture the owner state
   and full-row digests, replay the same acceptance once, and require identical
   accepted identity and all seven digest/count pairs. Recheck the original fixed
   two plan hashes and exact session dates/fingerprint. Finally resume from
   generation 5 to 6 only after all original release gates pass.

## Limits

One additional create/accept attempt only, using the existing account. The prior
failed attempt remains intact; its exact freshness failure and absence of any
create/accept response or success are required. No automatic retry or timeout
resume. If the session is too old, stop while paused; this packet does not
authorize credential refresh, another sign-in or another account.

Reserve an attended 20-minute continuation window after fresh preflight. This is
a soft target, not permission to skip checks. No backup/restore retry, migration,
deployment, trigger change, flag or numerical-policy activation, deletion, paid
resource or PR merge is included. The old unstamped application is incompatible.

The original execution sheet says: **"Do not issue a second installation,
backup, restore, promotion or smoke attempt automatically."** This packet requests
approval for that one additional attempt after the failed local readiness check.
User approval is required before any further production mutation.

## Concrete operator and verification

Retained helper: `output/app-quality-release/cutover-20260924/prearmed-create-accept.mjs`.
SHA256: `d03b83fbbad757b0514713e8db5907560563439a0ce0bbe7fc16e4ca5f88126e`.
Command: `node output/app-quality-release/cutover-20260924/prearmed-create-accept.mjs`.
No arguments, new credentials or target overrides are accepted.

Before launch, write a fresh `create-accept-preparation-attestation.json` with the
existing fixed project/deployment, phase `paused`, paused `true`, generation `3`
and actual commit/readback timestamps (at most 120 seconds old). The operator
cannot independently prove the attested database state. After READY and committed
resume, atomically publish the distinct `create-accept-prearmed-attestation.json`
with phase `create-accept`, paused `false`, generation `4` and actual timestamps.
Do not reuse or overwrite the old `create-accept-attestation.json`.

Five injected-clock/transport tests and two invariant-comparator tests passed
and were independently rerun. They verify that slow preparation precedes the
fresh request window; no private save occurs before the first request; 22 seconds
of durable capture leaves only eight seconds for acceptance; 31 seconds prevents
acceptance; stale/wrong-generation evidence sends no request; and an acceptance
error signals re-pause before saving/validation. Original-plan comparisons reject
changed, missing, duplicate and extra rows. Syntax check passed. Independent
review found no blocker. These tests do not establish production latency or
database containment. No pre-armed attempt has been executed.
