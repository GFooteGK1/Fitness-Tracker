# Corrected continuation: profile passed, coaching paused

**Historical result.** The subsequent approved pre-armed opening also stopped
before HTTP. Coaching is now paused at generation 5. See the
[September 25 result](production-prearmed-result-2026-09-25.md).

Greg approved the corrected continuation on September 24. The existing synthetic
account signed in, created its profile as the authenticated owner, and returned
an empty weekly program. The deliberate paused create returned the expected 503.
No protected coaching rows changed; the allowed revision row initialized to zero.

**Coaching is paused at generation 3. The subsequent create/accept operator
stopped before its first HTTP request because its gate attestation expired.**
No program, proposal, prescribed session, acceptance or replay was created.
Both original accepted-plan hashes remain unchanged against the encrypted
pre-revision baseline. The new build and both migrations remain installed.

## Verified execution

- Fresh production metadata matched the pinned deployment, all three aliases,
  redirects, 31 bindings and absence of a rolling release.
- Both migration ledger hashes and the complete reviewed catalog matched.
- Checkpoint `c28bf61` passed CI `35995061386`, including mobile verification.
- The profile correction used the same retained account and public anon input.
  It made no new account, admin-key retrieval, trigger change or deletion.
- All 54 public owned scopes were reconciled after the stop. Only the expected
  profile and revision-zero row exist. Auth has one identity, session and refresh
  token; no refresh operation was issued by the operator.
- Temporary resume committed at 12:03:22.994023 UTC, generation 2. Its independent
  readback was 12:03:43.902774 UTC. Re-pause began at 12:04:14.386 UTC and committed
  at 12:04:18.599080 UTC, generation 3. Independent closed readback completed at
  12:04:37.486111 UTC. These meet the 60-second start and 90-second confirmation
  limits measured from the open readback. The committed open interval was about
  55.6 seconds; real athletes could write during that interval.
- Final reconciliation at 12:06:12.011962 UTC verified the same paused generation.

## Proven timing defect

The attestation file became available 14.537 seconds after the recorded database
readback, leaving less than 0.463 seconds of its 15-second allowance. The launched
child then performed local ACL, decryption and evidence setup before checking
freshness again. That second check failed at 12:04:03.067 UTC, 19.165 seconds after
the readback. Individual setup durations were not instrumented.

Authenticated evidence contains only the create/accept attempt and failure.
Source inspection independently establishes that the failing check precedes the
first HTTP call. The empty database reconciliation agrees. This is a local
readiness defect; it is not evidence of an application create failure.

The next method must finish private setup before reporting readiness and publish
the independently read gate attestation in the same browser-control call that
captures it. It must preserve the 15-second freshness and request limits, the
30-second create/accept budget, and immediate re-pause on any error. The original
failed records remain intact. No second create/accept attempt is authorized by
the completed continuation.

See the [sanitized receipt](production-continuation-result-2026-09-24.json) and
[pre-armed attempt packet](production-cutover-prearmed-approval-2026-09-24.md).
Raw account and row evidence remains authenticated and encrypted in the approved
private recovery directory. No final resume, schema change, redeployment, paid
resource, deletion, merge or numerical-policy activation occurred.
