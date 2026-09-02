# ADR-0006: Layered adaptive-programming evidence and memory

- **Status:** Accepted
- **Date:** 2026-09-01
- **Deciders:** Greg Foote
- **Related:** ADR-0001 (compute vs compose), ADR-0003 (adaptive coach state and authority)

## Context

The adaptive coach must connect goals, assessments, completed training, recovery
signals, and repeated performance evidence without treating every value as the
same kind of truth. The current system separates confirmed memory, accepted
plans, prescribed sessions, and check-ins, but it does not yet define a general
performance-observation lifecycle or reproducible evidence used to reallocate
training emphasis. Imported device data and conversation can add useful context,
but recency, semantic similarity, or a model conclusion does not establish
authority. The design must preserve correction history, protocol comparability,
tenant isolation, and explicit plan acceptance while keeping logging small enough
for daily use.

## Decision

We will extend ADR-0003 with a layered, typed, promotion-gated storage model in
which Supabase owns athlete and training records, version-controlled code owns
policy, deterministic evaluators own derived evidence, and the athlete owns plan
activation.

### Use six authority layers

| Layer | Canonical owner and write authority | Lifecycle and retention | Retrieval rule |
| --- | --- | --- | --- |
| Doctrine and protocol policy | Version-controlled coach code and documentation. Only a reviewed application change can write it. | Versions referenced by a stored assessment, evidence record, or plan are retained. A newer version supersedes but never rewrites a referenced version. | Load the exact policy, protocol, schema, and algorithm versions required by the operation. |
| Confirmed athlete facts | `coach_memories` and typed assessment records in Supabase. Explicit authenticated athlete confirmation, including confirmation of an imported candidate, is the only promotion path. | Corrections create a new version that supersedes the old record. Withdrawn, superseded, and expired facts are excluded from active use; history remains while the account and referencing decisions remain. | Query active facts by typed key, purpose, freshness, and effective time. Never retrieve arbitrary recent memories as authority. |
| Canonical execution and check-ins | `workouts` is the execution record. `prescribed_sessions.completed_workout_id` is the single plan-to-workout link. `coach_checkins` stores concise athlete feedback. Existing WHOOP tables remain canonical for WHOOP data. Only authenticated logging, an atomic completion flow, or a reviewed integration may write these records. | Canonical records remain for the account lifetime unless the athlete deletes them. Corrections are explicit and invalidate dependent evidence; a second workout store or copied WHOOP metric store is prohibited. | Read by stable identifiers and bounded time windows. A check-in adds context but never replaces the workout or measurement record. |
| Performance observations and source imports | Append-only normalized observations in Supabase plus a private source-import manifest. A validated logger or athlete-confirmed idempotent importer writes them; models cannot. Raw artifacts stay outside hot relational queries and may be deliberately not uploaded. | A correction supersedes or excludes an observation instead of overwriting it. Normalized observations and import manifests remain while the account exists. Each source adapter must declare a raw-artifact policy before production activation. Any app-retained artifact also requires a duration; a not-uploaded policy requires no app retention duration. | Filter by observation type, protocol, unit, variation, comparability tags, effective time, and status. Source record IDs and content hashes make retries idempotent. |
| Derived evidence and read models | Deterministic, versioned application evaluators produce evidence from referenced canonical observations. The LLM may explain an output but cannot create an authoritative value. | Evidence remains while a decision references it. Unreferenced projections may be regenerated or evicted, but inputs, exclusions, evaluator version, and content hash remain reproducible. Source correction invalidates affected evidence and requires a new evaluation. | Build purpose-specific evidence packets from compatible active observations only. Include evaluation window, sample count, freshness, confidence, and missingness. |
| Programming hypotheses, adaptation decisions, and plan versions | Immutable Supabase proposal and plan records. Deterministic policy proposes the bounded action; an authenticated athlete acceptance RPC alone activates a plan version. | Decisions and accepted plan versions are append-only audit records for the account lifetime. A changed decision creates a replacement; it never edits the accepted version or its rationale. | Retrieve the active accepted version and the exact evidence IDs, policy version, and evaluation window behind each proposal or explanation. |

Every user-owned table and private storage object must enforce tenant ownership.
Supabase tables use RLS and `FORCE ROW LEVEL SECURITY`; cross-table links use
tenant-consistent composite constraints. Security-definer transitions use an
empty `search_path`, least-privilege grants, record locks where state changes,
and payload-matched idempotency.

### Require typed provenance

Every confirmed fact, observation, derived evidence record, and programming
decision carries enough metadata to explain what it is and when it was valid:

- user and stable record identifiers;
- record type and schema version;
- effective or observed time, capture time, and creation time;
- source kind, stable source record identifier, and import or input fingerprint;
- provenance, status, and supersession or exclusion link;
- unit, protocol identifier and version, variation, and comparability tags for a
  measurement;
- referenced observation identifiers, evaluation window, sample count,
  exclusions, algorithm version, freshness, and confidence for derived evidence;
- referenced evidence identifiers and policy version for a proposal or decision.

Raw bar-path arrays, video, images, and full vendor payloads are not copied into
hot relational queries or model context. A source adapter may retain a private
artifact only under its declared retention policy. The durable import manifest
keeps the source, file hash, schema version, status, counts, and error summary so
the app can prove idempotency after raw content expires.

The Qwik adapter declares `user_retained_not_uploaded`. Its original JSON and
bar-path arrays never enter app storage. Supabase retains the source SHA-256,
bounded provenance, and normalized measurements only. All imported observations
remain unverified and ineligible for adaptation until a separate athlete review
transition confirms them.

### Gate promotion between layers

Conversation and model output are untrusted source material. They may create a
review candidate, but they never promote themselves.

1. A stable athlete fact becomes confirmed memory only after explicit athlete
   confirmation.
2. A measurement becomes canonical only through explicit logging or an
   athlete-confirmed, idempotent import.
3. A deterministic evaluator may derive evidence only from active, comparable
   observations under a versioned protocol.
4. An adaptation policy may create an immutable proposal only when its evidence
   threshold is met. Insufficient, stale, or incompatible evidence produces
   `hold` and a request for the smallest useful next measurement.
5. One noisy session or one readiness value cannot establish a new performance
   level or reallocate block emphasis.
6. A proposal becomes active programming only through explicit athlete
   acceptance. The LLM cannot activate, edit, or silently replace a plan.

### Assemble context for one decision

Context assembly uses structured queries and a declared purpose, not a generic
recent-memory limit or vector similarity:

- planning uses confirmed goals, required qualities, current constraints,
  compatible assessments, and the accepted plan version;
- session execution uses the prescribed session, relevant current readiness,
  explicit constraints, and recent comparable evidence needed for that session;
- adaptation review uses canonical completed workouts, check-ins, compatible
  observations, derived evidence, and the current programming hypothesis;
- explanation uses the immutable decision and the exact records it referenced.

Each packet reports source, freshness, protocol, confidence, exclusions, and
missing required data. Semantic retrieval may locate a conversation for review,
but it cannot supply current numeric truth or override a structured record.

### Correct and roll back without rewriting history

- A fact correction creates a superseding version. An observation correction
  creates a superseding or excluded record and invalidates dependent evidence.
- Re-evaluation creates new derived evidence and, when warranted, a new immutable
  proposal. Existing decisions keep their original evidence references.
- A plan rollback is a newly reviewed replacement version accepted through the
  same atomic transition; an accepted plan is never reopened for editing.
- An application rollback does not reinterpret stored records under older or
  newer policy. Stored version references remain authoritative.
- Import retries use the original source identifier and fingerprint. A mismatched
  retry fails closed instead of duplicating or replacing data.
- Schema rollout and production migration remain separate approval boundaries.
  This ADR does not authorize a production database change.

### Keep the model general

APEX is a proving example, not the product ontology. This architecture does not
add APEX scoring tables, event-specific entities, vendor-specific programming
authority, automatic memory promotion, transcript-as-truth retrieval, duplicate
WHOOP storage, default video retention, medical diagnosis, or autonomous plan
activation.

## Consequences

- Positive: The coach can explain exactly which confirmed facts and repeated
  observations support a change in training emphasis.
- Positive: Corrections, imports, and evaluator upgrades remain auditable and do
  not silently rewrite accepted decisions.
- Positive: Daily logging can stay small because the app asks only for data that
  can change the current decision.
- Negative: The model requires more typed records, version fields, indexes, RLS
  policies, and lifecycle tests than a single flexible memory table.
- Negative: Source adapters need protocol and retention definitions before they
  can become production features.
- Negative: Evidence recalculation and invalidation add application complexity,
  even though projections themselves are disposable.
- Neutral: The initial rollout can extend the existing coach and workout tables;
  it does not require embeddings, event sourcing, or a new external service.

## Alternatives considered

**One flexible memory table.** This would be fast to add, but it would mix stable
facts, measurements, derived conclusions, and plan decisions. Status, correction,
freshness, protocol comparability, and write authority would become conventions
inside JSON rather than enforceable contracts.

**Conversation history or vector retrieval as the coach brain.** This could make
context assembly feel simple, but relevance and recency do not prove that a fact
is confirmed, current, or numerically authoritative. It also makes corrections
and plan-change explanations difficult to audit.

**Vendor-specific telemetry and APEX event tables.** This could optimize the
first import and current training example, but it would bind the coach to one
device or competition. Generic observations with protocol and comparability
metadata support APEX, strength, running, and later sources without giving a
vendor ownership of programming policy.

**Full event sourcing for every athlete action.** This would maximize replay and
audit detail, but it adds operational and query complexity beyond the present
product need. Append-only observations and immutable decisions provide the
needed history while canonical workouts and confirmed facts remain directly
queryable.
