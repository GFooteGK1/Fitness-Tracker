# Test-account session renewal — proposed amendment

**Browser access is restored. Coaching was independently verified paused at
generation 5 at 12:14:08 UTC (7:14 a.m. Central).** The automated test-account
session expired at 11:58:50 UTC (6:58 a.m. Central). Local authenticated inspection
confirmed the expiry and that the approved attended attempt/failure markers are
absent. The attended smoke has not started.

The [approved attended packet](production-cutover-attended-approval-2026-09-25.md)
explicitly says **"No refresh, sign-in or key read."** This amendment requests
only the additional renewal needed to use that still-unused approval.

## Proposed action

While coaching remains paused, send **one** refresh-token request to the existing
Supabase project `auolnfwetmfcwhtvakzy` for the same synthetic test account. Use its
already encrypted refresh token and the existing frozen public anon key. Require
a fresh generation-5 gate read, preserve a distinct one-shot marker, enforce a
15-second request deadline, and never retry an uncertain or failed request.

Authenticate and encrypt the response in the existing private recovery folder.
Require the same user ID, email, project issuer and authenticated role/audience,
plus enough session lifetime for the approved five-minute preparation wait and
execution. Store the renewed session under a new evidence name; preserve the
original session, earlier markers and all failed-attempt evidence.
Require authenticated renewal-success evidence before launching either renewed
consumer; the presence of a session file alone is insufficient.

Use separate receiver and paused-replay copies with their session lookup changed
only to the renewed evidence name. Their targets, frozen input, idempotency key,
generation checks, request budgets and original release gates remain unchanged.
Then refresh the remaining preflight and execute the already approved attended
smoke, re-pause, replay, invariant comparison and final-resume sequence.

No new account, password change, additional API-key retrieval, permissions change,
paid resource, migration, deployment, numeric-policy activation or extra smoke
retry is included. Refresh may rotate the saved test session's refresh token;
that response is retained privately before validation. Any failure leaves the
release paused and requires reconciliation.

## Concrete preparation

Local helpers and tests are retained in
`output/app-quality-release/cutover-20260924/`: `renew-attended-session.mjs`,
`attended-create-accept-renewed.mjs`, `smoke-operator-renewed.mjs`,
`replay-renewed-session.mjs`, and the focused renewal tests. All 16 tests passed;
independent review found no remaining blocker. The
[preparation receipt](production-session-renewal-preparation-2026-09-25.json)
records their exact hashes and code-only archive. No renewal request
or new smoke invocation is authorized by preparing these files. Approval of this
amendment authorizes one renewal and continued use of the existing attended packet.
