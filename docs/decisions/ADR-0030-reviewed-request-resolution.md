# ADR-0030: Atomic resolution of reviewed requests

Status: accepted for local implementation; hosted rollout and numerical activation remain separate.
Date: 2026-09-27 Chicago / 2026-09-28 UTC.
Tracker: Fitness-Tracker-u5l.6.12.

An HTTP rejection or an empty read does not prove that an earlier uncertain
request cannot still commit. Clearing pending state on that basis can create
duplicate work when the athlete edits and submits a replacement.

Use an explicit authenticated resolution RPC for the exact owner, canonical
session, operation, request ID and original payload. It holds the same locks as
the set/completion writer. A matching committed request returns its original
receipt, including historical corrections and skipped completions. Otherwise it
stores an immutable no-write resolution. Insert guards reject every subsequent
write with that owner/operation/key, rolling back the entire transaction.

Resolution is deliberate, not automatic on failure. The browser verifies the
echoed identity, payload and result, then archives the original request and
decision before releasing pending state. Transport, identity, archive or storage
failures preserve recovery state. A confirmed unsaved request can be edited under
a new key; actual values and completion feedback are restored for review while
the completion manifest and time are regenerated on deliberate submission.

The resolution table has FORCE RLS and no API table grants. Only the owned RPC
is exposed to authenticated users. No service client, numerical prescription
authority, write-pause override or production enable switch is introduced.
Ordinary current-state lookup and automatic new-key retry were rejected because
neither prevents a delayed original from writing.

Evidence: [request resolution verification](../verification/programming-quality/reviewed-request-resolution-2026-09-27.md).
Local HTTP-handler/PostgREST/DB proof is separate from actual browser lifecycle
verification, which remains open under the parent task.

## Proposal issuance and acceptance

The same deliberate recovery contract now covers exact issue and acceptance
identities. Issue resolution locks the global registration ID, owner request key,
saved proposal and program. An absent issuance creates an immutable closure that
fences both late registration and late issuance (including alternate keys for
the closed registration). Issuance uses a nonwaiting registration lock at its
insert guard to avoid the inverse program/registration lock order. A completed
issuance returns its reserved IDs; it does not close an already saved proposal.
Existing private registration metadata can replay after closure, but issuance
stays fenced. A saved metadata receipt is not new numerical authority.

Acceptance resolution follows the existing proposal/program/plan lock order.
An accepted proposal returns its historical target plus the current active plan
pointer, even after a later replacement. An unaccepted proposed, expired or
rejected proposal can be permanently closed while preserving rationale, target
prescriptions, execution slots and the active base. Late acceptance cannot apply
it. The private immutable resolution table has FORCE RLS and no API table grants.

HTTP accepts only the original owner, program, operation, key and ID identity.
Browser pending state is released only after a matching result is archived.
Saved-result archives omit the mutable active pointer so that storage-removal
retries remain valid after a later plan change. The UI describes historical
acceptance separately from current activation. Rejected/expired proposals remain
readable. Default numerical capability and trusted registry stay disabled/empty.

Evidence: [proposal resolution verification](../verification/programming-quality/reviewed-proposal-resolution-2026-09-27.md).
