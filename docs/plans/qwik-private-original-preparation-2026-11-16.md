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

The inactive `qwik-private-owner-transaction` adapter owns one verified server
principal, one exclusive lease-generation and one transaction. It exposes only
the five typed private-client methods. Both legacy and aggregate owner claims
are transaction-local and checked before operations and commit; healthy release
requires a clean context. Callback failure rolls back. Cancellation/unfinished
queries drain or discard the owned generation; an unknown commit is reconciled
by its original receipt, never automatically replayed. Generation-fenced
query/release/discard and protocol-derived transaction state are mandatory driver
contracts. No production driver, Auth verifier or pool is wired or qualified.

The caller executor must be non-superuser, NOBYPASSRLS and isolated from external
roles in both membership directions, including indirect membership and capability
to assume the function definer. The disposable fixture separates this caller
from a narrowly granted non-superuser BYPASSRLS function definer. Explicit owner
checks and composite foreign keys protect within that privileged function; RLS
does not protect a BYPASSRLS definer. The unchanged FORCE RLS policies reject a
non-bypass definer without canonical privileges. Actual function ownership,
grants and hosted auth/pooler behavior require separate activation qualification.
No production role, grant or membership is prepared by application execution.
Private entry additionally checks the function owner's actual catalog flags
before owner-policy access: missing, superuser or non-BYPASS capability fails
closed. This explicit requirement enforces the prepared dedicated-definer
architecture; it is not a diagnosis of the historical warmed-role anomaly or
permission to provision that role. The exact earlier helper is archived only for
disposable characterization against known bound claims, never an active route.

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
The immutable attestation binds owner plus explicit QWIK source-account/library
continuity (`owner_attested_source_library`), not inferred device continuity.
Owner attestation is not vendor verification. A namespace cannot be relabeled
after registration; missing provenance fails closed.
Changed payloads require explicit same-path version/reason lineage. Moving or
relinking an identity to another canonical set/workout is unsupported.

## Lifecycle choices remain gated

There is no default production mode, duration or quota. Policy and each request
must explicitly choose `until_explicit_clear` (no expiry) or `finite_until`
(a finite future timestamp within an explicit policy limit). Missing/ambiguous
tuples fail closed. No distant dummy timestamp, silent conversion or renewal is
used. The existing exact 5,000,000-byte original bound remains. A configured
aggregate quota is authoritative; exhaustion stops new registrations, never
evicts history or substitutes compressed/normalized data for original bytes.
An administrator must approve retention/quota and the executor boundary before
activation.
Expiry denies retrieval but does not delete bytes; expired bytes still consume
quota. Explicit consent/reason can clear BYTEA while retaining a tombstone and
receipt. This is not secure physical erasure from MVCC, WAL or backups. Identity
and correction history remain reserved after expiry/deletion/staleness. Account
closure remains RESTRICT/fail-closed; this is not a complete erasure workflow.

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
unique-claim/locking test is required for each final release tree before claiming
that operational proof. Prior qualification of a different tree/engine does not
establish it for a changed candidate. Source constraints and serial contention/
replay are narrower evidence. The prepared native lane now requires actual
`server_version_num` in [170000,180000) before SQL replay and fails if PostgreSQL
17 is absent. Pure version-boundary tests and PGlite 18 tests do not qualify a
native 17 engine, actual Supabase Auth, pooled wire cancellation or Supavisor.
The dedicated CI lane provisions signed PostgreSQL 17 binaries only on its
disposable VM and requires all seven races plus eight role/transport controls.
The latter use a pinned test-only `pg` driver with its public ReadyForQuery status
API, real one-connection owner reuse and cancellation of a causally blocked owned
backend. Controlled acknowledgement suppression after COMMIT is distinguished
from actual wire acknowledgement loss. This fixture does not implement hosted
Auth, production pool credentials or Supavisor, and does not activate a driver.

Activation also requires an approved retained-original backend/cost budget,
retention/quota values, namespace assurance, account-closure/backup treatment,
same-hash re-retention and relinking decisions. Neither a public route nor policy
rows are enabled here. There is no automatic expiry deletion, account deletion,
historical import, scoring or observation promotion.

The preparation SQL is outside active migration history and additionally refuses
execution without a disposable-fixture opt-in. That flag is an accidental-apply
tripwire, not authorization. No test results, deployment, production storage,
namespace provenance or policy decision are established merely by this document.
