# 0035 - Scope supervised programming by athlete, program and reviewed content

- Status: Local review authority and lifecycle enforcement implemented and independently reviewed; runtime/UI and live qualification unfinished, not activated
- Date: 2026-09-29
- Scope: Approved milestone Fitness-Tracker-i40.17; no hosted activation

## Decision

Use durable, authenticated review records and explicit athlete/program enrollment
for the supervised milestone. Keep the global numerical policy disabled. A client
may submit an untrusted candidate for review, but cannot create trusted compiler
authority, claim reviewer identity, enroll itself or accept on another athlete's
behalf. Every new numerical week requires approval of its complete exact content.

Reviewer access is limited to the immutable review packet for the enrolled
athlete/program. Existing owner-context readers remain athlete-only. A different
reviewer must use a separately authorized, bounded packet read; this feature does
not grant general access to the athlete's workout, health or profile tables. The
packet contains only evidence needed for this review, with omissions visible.

The current server registry is an empty, deployment-time array. Its exact-context
matching and immutable registration/RPC lifecycle are useful foundations, but
editing a developer fixture for each athlete week is not the pilot workflow.
`reviewed-http-service.ts`, `reviewed-proposal-service.ts` and weekly capability
discovery currently share the global initialDosePolicy switch. A UI-only allowlist
would not constrain direct authenticated RPC access.

## Boundaries to implement

Enrollment binds one athlete, one owned program, a designated authenticated
reviewer, an expiry and allowed operations. Provisioning/revocation is an audited
operator action, separate from athlete acceptance and requiring target-specific
authority when hosted. No enrollment or reviewer permission exists by default.
The reviewer may also be the athlete only when that exact relationship is
explicitly enrolled; knowledge of an email address is not reviewer authority.

An untrusted candidate contains the complete week, source/context digest, accepted
base identity, transition, rationale and relevant review evidence. The server
validates schema, supported movements, effort/rest/time semantics and whole-week
reconciliation. It creates an immutable digest-bound review version. A reviewer
sees the same full prescription and changed-versus-preserved work that the athlete
will see. Approval derives the reviewer from authentication, checks enrollment,
binds the exact content and source, and records a durable receipt. Any content
edit creates a new unapproved version. No model or JEV result grants approval.

Approval also binds the exact enrollment/reviewer version. Replacing, expiring
or revoking reviewer authority invalidates unissued approvals; re-enrollment
cannot silently revive them. Exact already-committed receipts remain recoverable.

Only an approved version can supply the trusted compiler/registration seam. The
existing compiler runs again against fresh owned source; mismatched context
returns for review instead of silently rebinding approval. Existing immutable
registration, source freshness, execution continuity, owner isolation and athlete
acceptance remain authoritative. The initial implementation supports the existing
same-week and adjacent-next-week transitions. A `manual_complete_week` candidate
requires fresh authenticated review of the complete proposed week and its source;
its provisional compiler binding is not a prior coach approval or a policy-authorized
load trial. Any explicitly declared `reviewed_load_trial` still requires its existing
dose/week reconciliation contract. Unsupported operations remain explicit
review-required outcomes. Neither review mode bypasses execution continuity or
the later database issuance and acceptance gates.

Database checks enforce enrollment and approval at new registration, issuance,
acceptance and new execution writes, including direct RPC calls. They must not
trust a browser capability, application flag or submitted reviewer ID. Existing
global coaching-write pause remains an additional restriction. Nonpilot legacy
paths and historical accepted plans are not rewritten by this feature.

Supervised status comes from durable program/enrollment lineage, not a candidate's
format or client-supplied marker. Once a program is enrolled, stripping reviewed
metadata or calling a legacy proposal/acceptance RPC cannot evade approval.
Revocation does not erase that lineage or re-enable an unreviewed fallback.
Legacy behavior is preserved only for genuinely nonpilot programs. Qualification
must explicitly attempt those downgrade paths as well as reviewed endpoints.

Fresh source matching applies during review approval, registration, issuance and
acceptance. After acceptance, execution validates the approval's linkage to that
immutable accepted content, current enrollment and active execution membership;
it does not require the original preacceptance source digest to remain unchanged.
Actual-set logging itself changes source history and must not invalidate the
remaining sets. New proposal decisions use a fresh source and a new review.

Disabling enrollment prevents new mutations but preserves owned historical reads
and exact receipt recovery. Separate receipt-only recovery from functions that
could create a fresh mutation: check committed identity/payload first, return the
original result when exact, and otherwise refuse while disabled. Resolution that
permanently fences an unsaved request retains existing explicit user intent and
locking semantics. Rollback must prove no new work can escape through direct RPCs
while old uncertain outcomes can still be determined. Do not simply bypass the
current capability check for a mixed replay/new-write endpoint.

An accepted base must be real and suitable. Athlete selection and exact week
confirmation are outstanding. If the selected account lacks a compatible accepted
base, define and review an explicit first-base import/acceptance path; never seed
a fake acceptance or borrow a synthetic fixture to enter the replacement path.

## Alternatives

| Approach | Reason |
| --- | --- |
| Enable global policy with static registry | Rejected: exposes a global path and requires developer edits for each week. |
| Allowlist only in HTTP handlers | Rejected: direct RPC writes and revocation/replay behavior remain unqualified. |
| Client-provided reviewed recipe or reviewer label | Rejected: a claim of approval is not authenticated authority. |
| Durable reviewed candidates plus scoped database enforcement | Selected for design: maintainable review and bounded access, at the cost of new contracts, RLS/RPC verification and operator controls. |

## Qualification

The first implementation slice is the review authority itself: immutable candidate
versions, versioned enrollment, deny-by-default storage, athlete submission with
server-derived facts, bounded reviewer reads, authenticated approve/reject and a
server-only approved-registration resolver. Keep lifecycle issuance, acceptance
and execution disabled until database enforcement and receipt-only recovery are
integrated and tested. Require a genuine compatible accepted base for this slice.

Before implementation closure, independently review the permission model and
additive migration. Prove unauthorized reviewer/athlete/program denial, expiry and
revocation races, digest/context tampering, stale approval, concurrent acceptance,
response loss and exact recovery, no-write resolution, preserved historical rows,
legacy behavior, and two successive full authenticated proposal/log/review cycles.
Use new scoped qualification cases without opening the broader P5 sealed set.
Tie release and rollback evidence to exact reviewed artifacts before requesting
the remaining hosted authority. Local mechanical tests do not qualify coaching
quality or establish a named athlete's accepted week.

## Consequences

The first milestone gains a repeatable supervised workflow rather than broader
autonomous generation. Existing P0-P6/APEX work and numerical-policy qualification
remain open. No source capability, registry, credential, permission, production
data or deployment changes are made by this decision record.

## Lifecycle integration approach under i40.17.2

Source inspection after the foundation review found that the existing proposal
guard returns early when reviewed-format markers are absent. Direct owner table
paths also exist. Enforcement must therefore derive from permanent program
lineage and protect tables as well as the named reviewed RPCs. This approach
is now implemented with disposable SQL and independent review. Real retained
Auth/PostgREST, multi-connection races and browser qualification remain required.

| Boundary | Required enforcement |
| --- | --- |
| Initial accepted base | Operator provisioning captures the exact existing owned plan identity and content digest in an immutable anchor. An anchor records prior acceptance without fabricating a new review. Existing unanchored lineage fails closed until explicitly provisioned. |
| Registration | Registration ID equals approved candidate ID; the complete private packet equals the immutable approved packet. Check current enrollment version and source. Protect direct inserts as well as the service RPC. |
| New plans and sessions | Guard plan versions, prescribed sessions and execution slots against the exact approved registration manifest, independent of submitted format markers. |
| Acceptance | Check approval/source before state changes. The late proposal trigger uses the existing accepting-state freshness check because base supersession and the active-pointer update have already happened. Deferred final-state checks prevent direct partial acceptance. |
| Execution | Active accepted plan must match the initial anchor or an exact approved registration and accepted proposal. Check current enabled enrollment and immutable active execution membership, without requiring the preacceptance source revision. Preserve original approval provenance across later enrollment versions. |
| Alternate writes | Cover set reports, checkins, session signals, completion receipts and execution-state updates. Legacy completion paths must satisfy the same authority or explicitly reject supervised reviewed sessions. |
| Recovery | Use authenticated, actor-scoped read-only receipt getters for issue/accept/set/complete. Existing resolution functions can create fences and are not receipt-only reads. Preserve results after revocation, expiry and later supersession. |

Coordinate lock order across the affected RPCs: owned program identity, program
advisory lock, program row, then operation identity and affected rows. Preserve
the existing capture-owner ordering. Direct-write table guards need fail-fast
advisory acquisition and NOWAIT row checks where callers already hold another
row. Real concurrent tests must cover conflicts rather than inferring them from
single-process SQL tests. The coaching pause remains an additional write fence;
new registration/set-report paths need coverage and receipt reads stay available.

Adversarial qualification includes stripped metadata through legacy proposal
RPCs, direct accepted-plan/session writes, stale approval, revoked/expired/replaced
enrollment, logging after source revision advances, initial-base execution,
carried execution roots, pause/recovery and unchanged nonpilot behavior.

## Private issuer and next integration

Retain the exact parsed candidate draft in the immutable private packet, outside
the bounded reviewer read. New registration recompiles from this retained input
and current owned source, requiring exact private/review packet equality. Missing
input on older approvals requires a new candidate; do not backfill authority.
Receipt recovery precedes enablement/source checks, and existing registration
readback precedes recompilation. Before fresh issuance, require durable supervised
candidate identity even for saved registrations because the shared SQL issuer
also supports nonpilot programs. Unavailable reads preserve the original request.

Canonical i40.17.3 connects these services to an authenticated complete-week
editor/reviewer workspace and scoped runtime. Keep global initialDosePolicy false
and the production static registry empty. Route default-off behavior, scoped
acceptance/execution, pending-request preservation and disabled recovery must be
verified before the retained two-cycle browser qualification. No hosted target or
accepted base is inferred from local synthetic fixtures.

## Workspace boundary under i40.17.3

Discover only bounded program/enrollment/candidate metadata using authenticated
pagination. Owner history survives disablement. Reviewer discovery requires the
current enabled, unexpired assignment; prior reviewer receipt recovery does not
grant continued athlete metadata access. Self-review UI checks reviewer identity
in the enrollment, because the owner retains the athlete role in discovery.

Seed editable work from the actual owned accepted schedule and complete session
content/protocols. Copy no prior approval tokens. The server checks current owned
source again when submitting an immutable new candidate. An edit to a submitted
candidate requires a new candidate identity, while uncertain submitted requests
retain their original payload and recovery identity.

Existing reviewed HTTP handlers use a global enablement callback. Do not supply
a broad per-user supervision boolean to that callback: the shared SQL preserves
nonpilot behavior. Scope each supervised acceptance/execution request by its exact
owned program/session/proposal and permanent lineage, with current enrollment and
SQL final authority. Read-only receipt recovery precedes live mutation eligibility.

Fresh provenance prevents same-week replacement of begun sessions under current
exact-prescription continuity. Expose that restriction rather than carrying stale
review tokens or weakening begun-work preservation. Adjacent next-week proposals
retain the existing unfinished-execution guard.

## Connected workspace and request recovery

The owner edits an untrusted full week, obtains a read-only current-source preview,
then saves the exact candidate. Preview is bounded and hash-bound to the draft;
it grants no review or write authority. Each subsequent save revalidates source.
The browser retains immutable pending requests in owner/program-scoped persistent
storage, verifies exact receipts, archives confirmation, then clears pending state.
Local recovery navigation is independent of current reviewer discovery so a revoked
reviewer can still recover their own decision without reading new athlete data.

Shared reviewed HTTP routes classify each owned resource by durable supervised
lineage. The dedicated supervised capability and current enrollment gate fresh
writes; receipt-only recovery runs first. Classification uncertainty does not fall
back to nonpilot authority. Global numerical policy remains disabled.

A successful preview cannot guarantee the base remains current until submission.
Stale submissions require durable cancellation/fencing before replacing their
original pending identity. The local implementation now provides that contract;
receipt absence alone is insufficient evidence to discard a possible write.

The implementation resolves the exact actor, program, operation and
original payload under the same transaction locks as its writer. A saved result
wins and remains recoverable. Otherwise an immutable no-write resolution must
prevent that old request from arriving later. Only verified saved/no-write
readback may archive and release the browser's pending slot. Preserve pending
state on conflicts, timeouts and account changes. Exercise both race orders and
disabled/revoked recovery. Audit submit, decision and issuance requests together;
each can become permanently ineligible after it was persisted in the browser.
Submission and decision use an immutable private FORCE-RLS resolution table;
the decision wrapper now locks program before request/candidate, and its renamed
implementation is not API-callable. Insert guards fence alternate privileged
writes using nonwaiting matching locks. Issuance reuses the existing reviewed
proposal resolution and registration fence after historical supervised scope
authorization. A closed issuance cannot be retried under a new key for the same
candidate. Explicit closure and pure getter endpoints remain separate. Browser
validates the echoed complete original request, checks saved results through the
existing validators, archives confirmation and only then frees pending state.
No current enrollment/write flag is required for original recovery/closure.
Real multi-connection and retained Auth/browser qualification remain separate
from disposable SQL/component evidence. Shared nonpilot access is not widened.
