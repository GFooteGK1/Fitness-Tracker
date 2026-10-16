# ADR-0021 - Capture and personalized coaching contracts

- **Status:** Accepted for local implementation
- **Date:** 2026-09-17
- **Deciders:** Greg Foote (implementation plan), Codex (contract realization)

## Context

Logging has atomic saves but divergent receipts and ambiguous edited retries. Default completion feedback can look explicitly reported, while planning omits relevant goals and history. Recommendations need freshness and missingness without acquiring prescription or acceptance authority. Existing accepted JSON and receipts must remain reproducible through additive migrations. Experimental branches contain overlapping ADR numbers and unreviewed numerical policies.

## Decision

Reviewed proposal preparation preserves exact full compiler content and source
bindings in a server-owned packet. Include the existing top-level training-intent
bridge, real revision row, setup bindings and exclusive next lifecycle/local-day
deadline. Preparation does not confer database authority. Pending transaction
integration must bind issuance to reserved IDs, preserve lock/replay ordering,
check exact source/current base and full session manifest, and support same-week
proposal coexistence without mutating accepted intent or duplicating execution.
The existing combined proposed/accepted window index and late acceptance trigger
order require explicit reconciliation before persistence is enabled.

Local transaction checkpoint: immutable service-only registration now reserves
proposal/plan IDs, and authenticated issuance selects only registration ID and
retry key. The complete envelope and ordered manifest must match; older RPCs
cannot copy an ID to acquire authority. Separate proposed/accepted window indexes
allow an unchanged accepted week beside one pending revision. The late acceptance
guard checks the expected post-transition base and pointer, then exact immutable
base fields, source revision, memory lifecycle, local day, versions and deadline.
Existing transaction rollback/replay semantics remain. Until execution carry-
forward is integrated, any prior set/signal/check-in or terminal state blocks a
replacement; exact same-window/date/sequence is the implemented local boundary.
This checkpoint does not close the full W5 acceptance contract or enable routes.

Reconcile trusted reviewed recipes with explicit canonical identities and literal
setup requirements before compilation. Keep added identities passive and outside
default selection/substitution. Eligibility reuses equipment, avoidance, experience
and constraint checks without assessment-name waivers. Identity mapping confers no
load or protocol equivalence. Generic reviewed running has unknown coverage until
its activity protocol supplies context. Version the reviewed catalog separately
and include it in source binding version 2. Only unchanged version-3 completions
use the reviewed mapping for factual readback; raw evidence remains intact.

Separate conversational projection size from deterministic evidence completeness.
Both use the same factual record logic; chat retains16k characters and reviewed
internal evidence has an8M ceiling. Purpose typing and a renderer guard prevent
the larger packet entering chat. The reviewed compiler still rejects any partial
retrieval or projection. Do not compress away actual sets or infer aggregates to
fit a prompt. Source bindings remain raw and corrections invalidate registration.

Reviewed completion version3 accepts only explicit feedback, occurrence and an
exact latest set-report manifest. Server snapshots supply accepted activity
identity while actual reports supply all performed quantities. Reuse protected
activity mutations/receipts and immutable capture history; avoid another receipt
store. A matching protected operation gates reviewed check-ins, preventing old
completion APIs from forging version3. Capture-owner then session locks preserve
atomicity with set writes. Unchanged completions are sparse reported evidence,
never confirmation of unreported targets; amendments invalidate that exact link.
Keep bounded client clock skew explicit and require occurrence before read cutoff.
Full-session evidence budget and UI/acceptance integration remain required.

Reviewed-set actuals use a separate append-only owner-scoped table rather than
overloading the earlier hardest-set signal. Identity is session/activity/set/side;
optimistic revision identifies corrections. Immutable rows retain full accepted
prescription/activity snapshots, explicit missingness, RPE scale and sensor method.
Capture serializes against completion with the session lock; exact replay remains
available after stale/terminal state. Every new report advances context revision.
Reviewed session storage must match the parent's exact dated prescription. Storage
does not enable numerical proposals or legacy completion; explicit guards retain
those boundaries pending atomic acceptance and set-preserving completion.

Complete reviewed weeks now use a server-owned registration before the rolling
compiler: source scope/hash, reviewed facts/recipe/schedule, target window,
sequence and direction are detached before asynchronous authentication. The
request selects an ID only. Reuse the authenticated source adapter and derive
the profile from its current owned base. Keep raw-source and reviewed-facts
digests separate; neither grants atomic acceptance authority. No route or saved
session contract is enabled by this read-time integration.

We extend canonical Supabase records and existing acceptance transitions with versioned capture provenance, confirmed intent, factual history and deterministic recommendations under the [frozen contracts](../verification/data-to-personalized-coaching/contracts.md).

For W5, the frozen `initial-dose-0.2.0` scope uses a trusted registry of complete
reviewed numerical options. The planner selects an option ID; it cannot supply a
new increment or replacement registry digest. The pure initial boundary binds the
before/after working dose, reviewed facts, source revisions and review source,
then rejects changed/ambiguous data and operation-invariant violations. This is
an offline option validator, not authenticated source retrieval or compiler proof.
All results retain `numericRuntimeEligible: false` until the separate integration,
verification and release gates pass. Hashes detect content drift; they do not
authenticate a reviewer or user. Future adapters must derive scoped sources and
registry authority on the server, not accept them as client assertions.

The next local slice uses a distinct `offline_reviewed_session_v1` compiler
result. Shared composer lowering preserves exact sets, rep/load ranges, RPE,
rest and reviewed-option provenance. Explicit offline validation rechecks the
option and ordered preparation recipe; default live validation rejects that
anchor source, including preparation blocks. A registered working movement may
use its evidence-only catalog entry for this offline check without changing the
catalog or bypassing equipment/experience/avoidance constraints. The result has
no estimated duration or verified week fit. C2-R's preparation rest remains
as needed. Preparation eligibility, authenticated source completeness/freshness,
profile/schedule reconciliation and accepted-plan persistence remain open.

The authenticated adapter now binds a trusted reviewed registration to the
owned current accepted base and bounded raw source packet. Use read-only revision
SELECTs, not the initializing RPC; recheck base content/pointer as well as the
revision. Include narrative, raw conflicting records and time-derived lifecycle
state. Detect row caps with exact counts. Current reads retain and reject
post-cutoff timestamps so process/database clock skew cannot masquerade as
missing history. Changed setup cannot reuse the old profile until reconciliation
is implemented. This verifies source correspondence, not a generalized numerical
rule, complete athlete logging, whole-week fit or atomic acceptance authority.

Complete reviewed weeks use `offline_reviewed_week_v1` until the live reader and
acceptance contracts can represent all reviewed work without loss. A trusted
recipe binds the full profile and factual context, ordered preparation/work,
equipment, monitoring protocols and explicitly reviewed schedules. Compilation
derives time from doses, rests and disclosed allowances; it never trims rests or
rep ranges to fit. Whole sessions move together and calendar spacing changes are
included in the output. Arithmetic fit does not certify recovery or training
outcomes. The approved synthetic developmental fixture retains its 75-minute
Saturday, unknown assistance loads, monitoring sensor metadata and actual RPE.
Movement/equipment identities not in the canonical catalog are case-local and
cannot acquire live eligibility from this registration. No production registry
or route consumes this format; canonical integration, authenticated whole-week
acceptance, correction invalidation and saved readback remain W5 work.

The rolling planner now has an explicit trusted reviewed build entry alongside
the unchanged default generator. Its `reviewed_rolling_week_v0_1` plan contains
dated `reviewed_programming_v0_1` sessions with ordered steps intact. It does not
invent a coverage ledger, fatigue costs, assessment load anchors or adaptive
assessment schedules. Browser-safe read contracts validate shape, time and
window consistency, source correspondence and monitoring references. Historical
readers do not consult current source freshness. A decoded hash is a provenance
label, not proof that the prescription matches a trusted registry or is eligible
for a new proposal.

Weekly GET, program views and the authenticated base reader recognize the new
format. Old mutation/review paths retain their old-format decoder. The normal
serializer checks both session arrays and refuses reviewed prescriptions. The
current database constraint cannot store this format; do not masquerade as v0.3
or populate dummy legacy fields. A subsequent local database contract extension
must cover owned storage, stable per-set capture, canonical completion, atomic
source-fresh acceptance and readback together. The view links to the workout log
instead of sending reviewed activities into legacy hardest-set feedback or
completion. Catalog mapping and numerical activation remain separate gates.

## Consequences

Reviewed same-week execution uses immutable planning-slot associations to original
canonical prescribed sessions. We reject copying reports or creating alias chains:
those approaches split actual history and retry identity. The plan storage marker
is immutable and selects a complete effective view, with no missing-row fallback.
Full prescription/date equality retains unchanged roots; begun work cannot be
moved or removed by a replacement. Atomic acceptance locks roots before the source
revision fence. New sets and completion validate active mapped membership while
old request receipts keep their original identity. Source version3/schema2 and
owner-scoped read adapters implement this locally. Application integration and
numerical activation remain separate gates. See the September27 execution
continuity verification record.

Explicit next-week transitions advance exactly one adjacent calendar week and
one sequence, copying the complete profile with only startDate changed. A trusted
recipe must already match that dated profile; calendar movement cannot rewrite
reviewed coaching authority. Transition snapshots project exact window fields.
SQL independently verifies the full profile/window transition, prior execution
dispositions and fresh target roots. Completed/skipped history stays unchanged;
unreported sessions remain unreported and unresolved begun work blocks rollover.
No old root is reassigned to the next week's dates. Preserve function-local
one-second lock timeouts explicitly after CREATE OR REPLACE; the local .05
migration restores and verifies those limits. See the September27 next-week
transition verification record.

Server issuance now composes trusted preparation and registration with the owned
ID-only transaction. A narrow authenticated recovery RPC exposes reserved
identities only, and returns null for both absent and foreign registrations.
Unavailable/malformed readback cannot authorize new registration. Persisted
registrations are the recovery authority after response loss; never recompile
them from changed source or invent a new request key. Source freshness remains
the existing issuance/acceptance transaction's responsibility. Exact known SQL
rejections are distinguished from uncertain failures without inferring rollback.
Service authority is created only for first registration after verified owner
authentication; recovery uses the athlete client. The default service registry
is empty and numerical capability remains disabled. HTTP/UI composition and
browser lifecycle verification are the next separate gate.

Dedicated reviewed HTTP mutations now use exact owner-bound envelopes, stable
request IDs and existing protected RPCs. Do not insert mutable-state checks
before receipt replay or make a confirmed mutation depend on context refresh.
Normalize validated path UUIDs before comparing PostgreSQL results. The default
route capability stays disabled while owned readback, durable client recovery
and interactive browser lifecycle remain unfinished.

Owned session readback now requires complete actual history and exact immutable
root/activity correspondence, rejecting capped rows or concurrent source changes.
The client saves the exact owner/session request before POST and retains it on
all uncertain/error outcomes. Same-tab reload resumes that request. Full actual
details and prior revisions stay visible on terminal sessions. New actuals begin
unknown and never copy prescribed targets. Rejected pending requests cannot be
discarded just because a later read sees no result: resolution must also account
for delayed original attempts. That resolution UX and browser lifecycle remain
unfinished; default numerical and route authority stays disabled.

- Positive: occurrence, field origin and review remain distinct; revision-aware corrections invalidate current advice while retaining history.
- Positive: optional feedback creates only explicitly reported observations; exact v1 receipt replay and legacy plan decoding remain available.
- Positive: transaction-owned invalidation, response revisions and expiring lease tokens fence stale publication.
- Negative: coordinated SQL/API/read-model versions and tenant/race verification increase complexity and establish a compatible-reader rollback floor.
- Negative: interaction-triggered refresh cannot promise unattended updates.
- Neutral: server flags default off. Qualified numerical review and production release remain separate gates. Experimental ADR numbers through 0020 are not reused.

## Alternatives considered

**Calculate a default increment from raw history.** Rejected for W5 because the
review approves supported trials and concrete options, not a universal increment
or completeness threshold. **Treat source snapshots as executable approval.**
Rejected because recorded text alone does not validate a complete typed dose,
current source bindings, whole-week fit or accepted-plan persistence.

**Route-specific patches.** Smaller diffs would preserve divergent retry, correction and provenance semantics.

**Autonomous model planner and new event service.** Additional model authority and infrastructure would not resolve evidence quality or qualified-review requirements.

**Full event sourcing.** Replacing canonical meals/workouts adds migration and query risk. Append-only amendment snapshots and immutable decisions provide the required audit trail.

## W7 implementation boundary

Recommendation publication and derived outcomes use narrow service-role RPCs reached only after session authentication; source queries retain the user's RLS client. Athlete response, shown acknowledgement and coverage confirmation use separate owned RPCs. A client cannot submit its own decision or observed outcome. Server runtime fingerprints and athlete-local scope are checked again at publication and response time.

Semantic evidence identity excludes incidental source revision/time noise, while each immutable decision retains its original dated audit snapshot. A current matching decision may be reused with a new publication acknowledgement; terminal decisions are not reactivated. Exact candidate suppression lookup avoids losing old dismissals to bounded history pagination. Response revision and expiring lease identity remain independent from canonical source revision.

Outcome events remain immutable. A later correction or retraction appends an outcome invalidation so readers can label the current interpretation unknown without erasing the historical observation. Done is a reported response and creates no canonical record. Owned recommendation origin freezes in the first logging operation and survives retries and amendments.

The permanent legacy assertion guard is independent of rollout flags. Disabling recommendations cannot restore unsupported nutrition-performance or HRV assertions. Neither implementation nor rollback grants numerical policy or plan acceptance authority.

## W8 integration clarifications

An explicitly saved nutrition target supplies the authority for factual logged remainder; an unrelated training-intent memory is not required. The rule reports protein and calories against that existing target, preserves estimated composition and unknown/partial coverage, and creates no new target or intake claim. Existing weekly reviews with action collect_signal now have a navigation candidate to their authoritative evidence/priority request. No new numerical eligibility or prescription rule was added.

Response recovery exposes no-write proof only for exact owned RPC rejection messages reached after exact-request replay and before insertion. Generic serialization, transport, unknown storage and payload-conflict errors retain the original request identity. This lets an expired defer or stale coverage report return to current records without silently discarding an uncertain successful response.

Recommendation source invalidation follows the implemented reader inventory: fifteen source tables, training_intent memories only, and no WHOOP trigger. Wearable freshness remains enforced in legacy/current contextual readers; this recommendation ruleset does not consume wearable values or preferences outside accepted-plan snapshots.
