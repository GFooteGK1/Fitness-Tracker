# Inactive private QWIK original preparation

This second slice is separate from the local exact-capture candidate. It adds no
HTTP/MCP route, upload, active migration, executor role, grants, policy rows,
background deletion, observation promotion or historical reconciliation.

## Responsibility boundary

The trusted server adapter reparses original bytes and verifies the complete
source-to-recording projection against verified canonical readback. Its injected
SQL port must be held only by that verified server. The prepared SQL requires an
explicit owner policy naming a dedicated executor and checks both the actual
session/active role and authenticated owner, including after an accidental grant
to an external role. SQL independently enforces original-byte hash/length,
canonical snapshot/path/recording identity, revision, owner, claims and atomic
receipt constraints. SQL does not independently recompute all phase metrics.
Possession of the trusted executor capability is therefore a real trust boundary,
not proof that the TypeScript join was invoked. Ordinary authenticated clients
must never receive that capability or a caller-controlled SQL/session port.

Public logging request prefixes and responses are not private commit proof. An
immutable private commit receipt binds the owner, operation, request key,
fingerprint, owned artifact and exact decorated public-ledger response. The
private transaction locks the ledger row and inserts this proof atomically;
replay/recovery require it. Public logging RPC contracts remain unchanged.

## Private bytes and source claims

One bounded BYTEA original, its metadata, namespaced source claims and receipt are
stored in one database transaction. No object storage claim or two-system commit
is made. Fresh readback independently checks retrieved bytes; missing, corrupt,
expired or deleted originals are never reconstructed from normalized JSON.
Original bytes are not copied into workout revisions or automatically sent to an
LLM. The original v1 capture retention marker remains historical capture policy;
the private copy is a distinct later registration.

The considered alternative is separate object storage plus database metadata,
requiring staged upload, orphan reconciliation and independent authorization.
Bounded BYTEA was chosen for this inactive preparation to make bytes, claims and
commit proof atomic without that second system. The tradeoff is database and
backup storage cost. This is not approval of a production backend or retention
policy; those activation decisions remain explicit.

Registration is against an already saved canonical recording. It does not amend
the workout. Permanent owner/namespace/source-set uniqueness prevents conflicting
registered assignments across workouts, while preserving distinct source IDs
with identical metrics. This does not prevent duplicate unregistered writes
through the existing public activity path. Namespaces require explicit verified
provenance/attestation; no filename, file hash or similarity supplies identity.
Changed payloads require explicit same-path version/reason lineage. Moving or
relinking an identity to another canonical set/workout is unsupported.

## Lifecycle choices remain gated

There is no default production duration or quota. An administrator must approve
finite retention/quota policy and the executor boundary before activation.
Expiry denies retrieval but does not delete bytes; expired bytes still consume
quota. Explicit consent/reason can clear BYTEA while retaining a tombstone and
receipt. This is not secure physical erasure from MVCC, WAL or backups. Identity
and correction history remain reserved after expiry/deletion/staleness.

An exact request replay returns its original commit receipt plus current raw
availability; it never promises the original is still retrievable. An expired or
deleted same-hash artifact cannot currently be renewed or retained again. Renewal,
re-retention generations, cross-device namespace proof, relinking, account erasure
and backup retention require explicit decisions; none are silently selected here.

## Qualification and activation

Disposable tests must prove source ACLs, internal role denial despite accidental
EXECUTE, actual RLS/foreign-owner boundaries, adapter rejection of forged phase
agreement before SQL writes, byte integrity and fresh-process retrieval, atomic
failure/replay, correction lineage and lifecycle denials. PGlite's single-connection
tests cannot qualify independent PostgreSQL-session races. A real concurrent
unique-claim/locking test remains required before an activated service claims that
operational proof. Source constraints and serial contention/replay are narrower
evidence.

The preparation SQL is outside active migration history and additionally refuses
execution without a disposable-fixture opt-in. That flag is an accidental-apply
tripwire, not authorization. No test results, deployment, production storage,
namespace provenance or policy decision are established merely by this document.
