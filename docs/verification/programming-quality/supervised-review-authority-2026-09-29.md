# Supervised review authority — September 29, 2026

Canonical task: `Fitness-Tracker-i40.17.1`, under milestone `i40.17`.
Decision: [ADR-0035](../../decisions/ADR-0035-supervised-programming-scope.md).
Status: local foundation passes independent review. No activation.

## Implemented boundary

An athlete submits proposed work, schedule and rationale. The server derives
owned source, a genuine accepted base and complete compiled content. Caller
fields cannot supply reviewer identity, approval, source hashes or enrollment
authority. A provisional compiler binding identifies this unapproved candidate;
it grants no permission to issue or accept a numerical week.

The `manual_complete_week` review packet includes the complete base and target,
changed/preserved/removed sessions, structured performed evidence and explicit
limitations. Known effort, symptoms, stop flags, rest, equipment, protocol and
measurement details remain visible. Raw private source tables are not returned
to the reviewer. An additional-note flag prompts clarification where needed.
Oversized evidence returns review-required instead of silent truncation.

The additive migration stores immutable program lineage, enrollment versions,
candidates and decisions. Operator provisioning is service-only; ordinary users
cannot enroll themselves. The designated reviewer uses authenticated approval
or rejection bound to exact content, source and enrollment version. No general
athlete-table access is granted. Replaced, expired or revoked enrollment cannot
authorize fresh work; exact committed receipts remain recoverable.

The service distinguishes bounded reviewer reads from owner-only private
resolution. It checks account continuity around asynchronous calls, checks the
write switch immediately before mutation, and preserves uncertain identities.
Recovery uses a read-only receipt lookup before considering a fresh write.
Approved private content must match the visible candidate's program, base,
transition and complete session manifest. The resolver still reports
`numericRuntimeEligible: false`.

## Evidence so far

- All four focused suites pass: 53 tests (13 candidate preparation, 19 service,
  5 contract and 16 SQL). An independent reviewer reran the 32 candidate/service
  checks with the same result and found no remaining service blocker.
- Full `npx tsc --noEmit --incremental false`: passes. Default incremental
  invocation could not write the existing cache (TS5033/EPERM); no source
  diagnostics occurred. See the existing validation investigation.
- Scoped ESLint: passes for the three new modules and all four test files.
- Disposable SQL tests cover role permissions, immutable enrollment versions,
  exact decisions, rejection, expiry/revocation/reviewer replacement, stale
  source, private-field exclusion, source/packet mismatch, actor-only receipt
  recovery and program archive/revocation. SQL and TypeScript nested public-field
  maps are checked for parity. Program-before-candidate lock order is consistent.
- An unmocked server adapter reads actual SQL/RLS source, prepares an adjacent
  next-week candidate, submits it, records approval and resolves identical private
  content. The test bridge uses PostgreSQL JSON serialization to match PostgREST
  DATE strings; an initial driver DATE-to-JavaScript timestamp mismatch was fixed
  in that bridge, without changing application date handling.
- Independent final review reran all 53 tests and found no material blocker for
  this authority foundation. It confirmed consistent program-before-candidate
  lock ordering and serialization of enrollment replacement. Single-process
  disposable SQL does not prove concurrent live database locking.

Checked implementation hashes (SHA-256, before any release packaging):

| File | SHA-256 |
| --- | --- |
| `supervised-candidate-server.ts` | `8794ff087319904fa62eb6edd1ce53846307723562b2417b5b9c0b1001aa11ac` |
| `supervised-review-service.ts` | `2af644843b80393116b0034fb83e88ecacab82bd88df8f4d02816595193ec3ba` |
| `supervised-programming-contract.ts` | `f084e83f96035e1dc0e8d62f17d5a11c51c54d7f89dde49965e3d5361d8927a3` |
| `20260930010000_supervised_programming_review.sql` | `0bf89ef520f703e9a7fcffee4b6b6802aa2f7a6bdb8e213f5b4c7ed48a47a721` |

These identify local reviewed files, not a deployable commit or hosted migration.

Follow-on under i40.17.2: candidate preparation now retains its exact original
draft in the private input snapshot for authenticated issuer recompilation. The
candidate-server hash above describes the foundation checkpoint, not this later
change. Current follow-on verification is recorded in
`supervised-lifecycle-enforcement-2026-09-29.md`; bounded reviewer output remains
unchanged. Do not use this historical table as a current release manifest.

## Remaining scope

This module is not wired into HTTP routes, the global registry or the issuer.
The new migration has not been applied to retained Supabase or any hosted
database. Disposable SQL checks cannot establish live Auth/PostgREST behavior,
concurrency or a named athlete's coaching acceptance.

The next integration must enforce permanent program lineage across reviewed
and legacy database paths, including registration, issuance, acceptance and
execution. Current source freshness applies through acceptance; subsequent
actual-set writes must validate the accepted content and current enrollment
without requiring the original source hash to survive their own history changes.
Rollback must deny new mutations while preserving exact historical recovery.

Milestone one also retains its named athlete/base selection, maintainable UI,
two successive authenticated cycles, bounded quality qualification and exact
release/rollback evidence. Hosted enrollment and pilot require target-specific
approval. The broader P0–P6/APEX work remains unfinished. Global numerical policy
remains disabled and the production reviewed registry remains empty.
