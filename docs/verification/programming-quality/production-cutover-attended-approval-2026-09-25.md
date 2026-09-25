# One attended smoke interval — proposed, not approved

**Coaching remains paused at generation 5.** The previous opening was used and
the smoke sent no HTTP. Its [result](production-prearmed-result-2026-09-25.md)
records the failure, containment and unchanged original plans. This packet
requests one corrected opening on Supabase `auolnfwetmfcwhtvakzy` and the existing
production deployment `dpl_2tZqnshTDrFR5EDQpgi78dcBNns7`.

## Concrete method

1. While paused, refresh exact deployment/aliases/bindings, schema/ledger,
   original fixed plan hashes, synthetic owner counts and existing session
   lifetime. Require generation 5 and profile/revision-zero only. The saved
   session expires September 25 at 11:58:50 UTC; stop if it cannot cover the
   five-minute preparation wait plus execution. No refresh, sign-in or key read.
2. Prepare three distinct SQL tabs: exact resume5, a read-only gate query, and
   exact re-pause6. Verify complete editor text through clipboard before launch.
   Keep the signed-in browser attended. Start the new receiver while paused;
   require its actual READY output with expected open generation6 and completed
   private preparation. Preserve all previous markers and failures.
3. Invoke the reviewed controller and browser adapter once. The same invocation
   submits resume5-to-6, waits for its completed result, independently reads
   open6, atomically publishes the new signal, observes the native helper, and
   enters containment in `finally` before returning. No model round trip occurs
   while this normal execution path is open. Never repeat a mutation because
   the UI says Running, times out or has an uncertain result.
4. The controller starts its clock before open submission. Open/read/signal/helper
   work has a 30-second total budget and each adapter call at most five seconds.
   The receiver independently retains 15-second attestation freshness, 15-second
   request deadlines and a 30-second shared create/accept budget. If the source
   clock leads the host by at most three seconds, wait for host time to catch up
   within the same 30-second budget, preserving the actual database timestamp.
   A larger lead fails closed; no timestamp rewriting or widened freshness.
5. On the helper's REPAUSE signal or any error, independently read the gate.
   Open6 permits one re-pause6-to-7; already paused7 needs no mutation. An ambiguous
   opening followed by paused5 is observed further because the opening could
   complete late. Any unexpected generation blocks mutation. Limit this entire
   controller invocation to 55 seconds, within a 60-second tool call. If its
   result is unresolved, continue only immediate read-only reconciliation and
   the already authorized containment; do not retry opening or smoke HTTP.
   Retain the original limits: begin containment within 60 seconds and target a
   verified closed read within 90 seconds of opening submission.
6. After independently verified paused7, authenticate the helper outcome and
   capture actual accepted identity, dates, fingerprint, revision and all seven
   count/digest pairs. Replay the same acceptance once while paused; require the
   same identity and unchanged seven pairs, plus both original fixed plan hashes.
   Only if every original release gate passes, final resume7-to-8 once and
   independently verify its committed state. The public REPAUSE signal is never
   treated as proof of successful acceptance.

## Scope and limitations

One new receiver attempt and one opening only. Retain the same account, frozen
input, idempotency key and pinned application. No retry on failure or timeout,
new account, credential refresh, backup/restore, migration, deployment, trigger
change, deletion, paid resource, numeric-policy activation or PR merge.
The old unstamped application remains incompatible and is not a rollback target.

This corrects the failed immediate UI assertion and the return-before-containment
path. Browser or process termination can still prevent a JavaScript `finally`
block from completing; aborting a call cannot retract a submitted SQL command.
The separate containment tab and attended operator remain required. Do not claim
a server-enforced closure guarantee or present local tests as live containment.

## Prepared artifacts and evidence

The retained local artifacts are in
`output/app-quality-release/cutover-20260924/`: `attended-create-accept.mjs`,
`attended-smoke-orchestration.mjs`, `attended-browser-adapter.mjs`, their tests,
`attended-open.sql`, `attended-repause.sql`, `attended-final-resume.sql`, and
`attended-gate-read.sql`. Exact hashes and completed verification are in the
[preparation receipt](production-attended-preparation-2026-09-25.json).
All 28 focused tests passed and independent review found no remaining blocker.
The 12-file archive was verified entry by entry and saved under the existing
private recovery directory; its path and SHA256 are in the receipt. The old
pre-armed helper is unchanged and must not be relaunched.

The actual shared read-only adapter was qualified while paused: it waited through
six intermediate Running observations, rejected stale result reuse, and returned
a new paused-generation5 read in 1.954 seconds. It submitted one SELECT and no
mutation. Opening, signal publication and re-pause paths are locally tested and
independently reviewed; they have not been run in this new method.

The prior approved execution sheet says **"Do not issue a second installation,
backup, restore, promotion or smoke attempt automatically."** Its specific
generation3-to-4 opening has been used. Approval of this packet would authorize
the single generation5-to-6 opening and the bounded continuation above; it does
not authorize further retries.
