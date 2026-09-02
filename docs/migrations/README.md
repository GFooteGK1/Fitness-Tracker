# Database Migrations

This directory contains SQL migration scripts for the SociusFit database schema.

## Current Schema Status

**Last Verified:** September 1, 2026
**Status:** Production migration history is aligned through the layered adaptive-coach evidence and trust schema

The four layered adaptive-coach migrations were applied to production on
September 1, 2026. Migration history, a zero-change dry run, live table and
index readback, generated types, and database lint confirm the additive schema
is live. See `adaptive-coach-production-application-2026-09-01.md`.

The February WHOOP v2 verification below remains historical context. On July 26,
the personal-records and view-template migrations were applied to the production
PostgreSQL 17.6 project and passed structural, grant, and rollback-only two-user
RLS verification.

All WHOOP v2 schema requirements are met:
- Sleep/workout IDs stored as TEXT (supports UUIDs)
- Cycle/recovery IDs stored as TEXT (supports integers or UUIDs)
- All user_id columns are UUID type
- RLS policies active on all tables
- Unique constraints in place

See `WHOOP-V2-SCHEMA-STATUS.md` for detailed verification results.

## Active Migration Files

These are the canonical schema definitions:

### `complete-holistic-migration.sql`
Complete schema including all features:
- User profiles and authentication
- Workout tracking (workouts, block_scores, benchmark_prs, movements)
- Nutrition tracking (meals, daily_targets, daily_summaries view)
- WHOOP integration (tokens, recovery, sleep, cycles, workouts, sync_status)
- Cross-domain analytics (fitness_correlations, daily_fitness_summary view)

**Use this as the reference schema.**

### `whoop-integration-migration.sql`
WHOOP-specific tables only:
- whoop_tokens (encrypted OAuth tokens)
- whoop_recovery (recovery scores, HRV, resting HR)
- whoop_sleep (sleep stages, efficiency, scores)
- whoop_cycles (strain, calories, heart rate)
- whoop_workouts (sport activities from WHOOP)
- whoop_sync_status (sync tracking)

### `food-tracking-migration.sql`
Nutrition tracking tables:
- meals (photo-based meal logging)
- daily_targets (macro targets)
- daily_summaries (aggregated view)

### `supabase-migration.sql`
Base schema (workouts, movements, user profiles)

### `personal-records-migration.sql`
Incremental, repeatable personal-record history table with forced user-scoped
RLS and least-privilege grants.

### `../../supabase/migrations/20260728134202_personal_record_idempotency.sql`
Forward migration that retains the best result per workout/exercise/type,
removes duplicate and intermediate PR rows, and adds the uniqueness constraint
used by the idempotent `/api/check-prs` write path. Applied and independently
read back in production on July 28, 2026 before the matching API deployment;
see `personal-record-idempotency-production-application-2026-07-28.md`.

### `../../supabase/migrations/20260728143952_nutrition_fast_logging.sql`
Forward, repeatable migration for private reviewed food-label facts, barcode
provenance, deterministic quick-log source references, and per-user request
idempotency. It forces RLS on `food_catalog_entries`, keeps source-meal foreign
keys tenant-consistent, and stores no label or meal images. Apply this migration
before deploying the matching `/api/foods/*` and fast meal routes.

### `view-templates-migration.sql`
Incremental, repeatable storage for immutable ADR-0001 presentation templates,
including the default dashboard template and forced RLS.

### `view-compositions-migration.sql`
Live incremental migration for ephemeral, user-scoped AI-composed view
cache entries. Cache identity includes local day, template version/content, and
deterministic facts content. Forced RLS ensures authenticated users can access
only their own cached presentation.

### `coach-system-migration.sql`
Incremental migration for the adaptive coach foundation: strength
assessments, explicitly confirmed memory, eight-week programs, immutable plan
versions and prescriptions, adaptation proposals, and check-ins. It includes
forced RLS, tenant-consistent foreign keys, least-privilege grants, and atomic
RPCs for memory versioning, initial proposal creation, and plan acceptance. It
has passed fresh-project and production apply-twice, rollback-only two-user
verification, grant readback, and Database Advisor review. See
`coach-system-verification-2026-07-27.md` and
`coach-system-production-application-2026-07-27.md`.

### `coach-plan-replacement-migration.sql`
Incremental, repeatable functions for atomically creating an immutable
replacement proposal against the current active plan and applying reviewed
program metadata only during acceptance. It preserves the existing RLS and
least-privilege table grants; authenticated users receive execute permission on
the bounded RPC only.

### `coach-complete-programming-v0-3-migration.sql`
Release-gating compatibility migration for immutable complete-programming v0.3
session prescriptions. It replaces only the existing prescription JSON check,
retains legacy v0.2 rows, enforces the new format on future writes, and validates
all existing rows in a separate short transaction. It does not change tables,
RLS policies, grants, triggers, or RPCs. The canonical SQL is mirrored exactly
at `../../supabase/migrations/20260728234500_coach_complete_programming_v0_3.sql`.
Apply this migration before deploying the matching v0.3 proposal route.
It was applied twice and rollback-verified in production on July 29, 2026;
see `coach-complete-programming-v0-3-production-application-2026-07-29.md`.

### `coach-execution-feedback-migration.sql`
Execution-feedback migration for atomically recording a prescribed
session's terminal result and concise check-in. It removes authenticated direct
writes to `prescribed_sessions` and `coach_checkins`, then grants only the
bounded `record_coach_session_result` RPC. The function serializes against the
active program, rejects stale or non-accepted plans, validates the feedback
contract in Postgres, and safely replays an identical idempotency key. The
canonical SQL is mirrored exactly at
`../../supabase/migrations/20260729182500_coach_execution_feedback.sql`.
It was applied twice and rollback-verified in production on July 29, 2026;
see `coach-execution-feedback-production-application-2026-07-29.md`.

### `layered-adaptive-evidence-migration.sql`
Additive persistence for versioned measurement-import manifests, generic
performance observation groups and values, and derived-observation lineage.
It extends confirmed coach memory with effective, expiry, and review times;
links observations to canonical workouts with tenant-consistent foreign keys;
keeps raw payloads in private retained object storage; and grants authenticated
users read-only, owner-scoped access. The canonical SQL is mirrored exactly at
`../../supabase/migrations/20260901152000_layered_adaptive_evidence.sql`.
It was applied to production on September 1, 2026; see
`adaptive-coach-production-application-2026-09-01.md`.

### `atomic-coach-session-completion-migration.sql`
Apply after `layered-adaptive-evidence-migration.sql`. This additive migration
introduces completion contract v2 and the bounded
`record_coach_session_result_v2` transition. A completed v2 session creates one
canonical `workouts` row, one check-in, the session-RPE observation, any
validated supplied observations, and the `completed_workout_id` link in one
transaction. A skipped result creates no performed-work record. Identical
idempotent retries return the original IDs; mismatched retries, stale plans,
terminal sessions, and cross-user access fail closed. The legacy
`record_coach_session_result` RPC remains available for existing clients and
its rows stay explicitly unlinked.

The canonical SQL is mirrored exactly at
`../../supabase/migrations/20260901170000_atomic_coach_session_completion.sql`.
It applied twice and passed the rollback verifier in a disposable local
PostgreSQL-compatible database. See
`atomic-coach-session-completion-verification-2026-09-01.md`. It was applied to
production on September 1, 2026; see
`adaptive-coach-production-application-2026-09-01.md`.

### `qwik-vbt-import-migration.sql`
Apply after `layered-adaptive-evidence-migration.sql`. This additive migration
adds user-scoped import idempotency and the bounded `record_qwik_import_v1`
transition. It records only normalized load, repetition, and per-repetition
velocity evidence plus a SHA-256-backed import manifest. Every import begins
`pending_review` and `unverified`; unresolved movement mappings remain
incomplete and cannot support adaptation. Raw Qwik JSON, full vendor payloads,
and bar-path arrays are not uploaded. The declared source policy is
`user_retained_not_uploaded`.

The canonical SQL is mirrored exactly at
`../../supabase/migrations/20260901183000_qwik_vbt_import.sql`. It applied
twice and passed the rollback verifier in a disposable local
PostgreSQL-compatible database. See
`qwik-vbt-import-verification-2026-09-01.md`. It was applied to production on
September 1, 2026; see
`adaptive-coach-production-application-2026-09-01.md`.
### `coach-trust-review-migration.sql`
Apply after `qwik-vbt-import-migration.sql`. This additive migration creates
append-only, user-owned review histories for coach memory, measurement imports,
and adaptation proposals. Its bounded RPCs reaffirm, correct, or withdraw a
memory; confirm or reject a Qwik import; and reject a proposed plan without
changing the accepted plan. Authenticated clients can read only their own
history and cannot write event tables directly. Qwik confirmation converts an
explicit athlete mapping into an athlete-confirmed comparable observation;
unmapped evidence remains excluded. Raw Qwik JSON and bar-path arrays remain
outside Supabase.

The canonical SQL is mirrored exactly at
`../../supabase/migrations/20260901220000_coach_trust_review.sql`. It applied
twice and passed its rollback-only verifier in PGlite PostgreSQL 17.5. See
`coach-trust-review-verification-2026-09-01.md`. It was applied to production on
September 1, 2026; see
`adaptive-coach-production-application-2026-09-01.md`.


### `secure-legacy-database-objects-migration.sql`
Containment migration for three historical WHOOP backup tables and the unused
`get_meals_around_workout` helper. It preserves every table and row, removes
anonymous and authenticated Data API privileges, forces RLS with no user
policies, retains service-role maintenance access, repairs the helper against
the current structured `meals.items` schema, and limits its execution to the
service role. The canonical SQL is mirrored exactly at
`../../supabase/migrations/20260730151344_secure_legacy_database_objects.sql`.
It was applied twice and rollback-verified in production on July 30, 2026; see
`secure-legacy-database-objects-production-application-2026-07-30.md`.

## Verification Scripts

### `verify-whoop-schema.sql`
Comprehensive verification script that checks:
- Column data types
- Unique constraints
- RLS policies
- Indexes
- Data integrity (no NULL user_ids)

Run this after any schema changes to verify correctness.

### `verify-autonomous-queue-migrations.sql`
Post-apply structural, grant, and two-user RLS verification for the personal
records and view-template migrations. Run both migrations twice first. The
script creates verification fixtures inside a transaction and rolls them back.

Both migrations passed this process on a disposable PostgreSQL 17.6 Supabase
project on July 26, 2026. See
`autonomous-queue-verification-2026-07-26.md` for that evidence record. They were
then applied and independently verified in production; see
`production-migration-application-2026-07-26.md`.

### `verify-view-compositions-migration.sql`
Rollback-only structural, least-privilege grant, and two-user RLS verification
for `view-compositions-migration.sql`. Run the migration twice first. The
verifier creates two user-scoped cache entries inside a transaction and rolls
all fixtures back. The migration passed apply-twice and verifier execution in
production on July 27, 2026; see
`view-compositions-production-application-2026-07-27.md`.

### `verify-coach-system-migration.sql`
Rollback-only two-user verification for the adaptive coach schema. Run
`coach-system-migration.sql` twice before this script. It checks forced RLS,
assessment and memory idempotency, initial and replacement plan activation,
atomic initial-proposal creation and retry, mismatched-payload rejection,
stale-proposal rejection, and cross-user isolation. The final migration passed
this process on a fresh PostgreSQL 17.6 Supabase project and in production on
July 27, 2026; see `coach-system-verification-2026-07-27.md` and
`coach-system-production-application-2026-07-27.md`.

### `verify-coach-plan-replacement-migration.sql`
Rollback-only verification for replacement proposal retry, mismatched-payload
rejection, stale-base rejection, metadata activation, execute grants, lack of
direct mutation grants, and cross-user isolation. Apply both coach migrations
twice before running it.

The replacement migration was applied twice and rollback-verified in production
on July 27, 2026. See
`coach-plan-replacement-production-application-2026-07-27.md`.

### `verify-coach-complete-programming-v0-3-migration.sql`
Rollback-only compatibility verification for the dual-format prescription
contract. Apply the v0.3 compatibility migration twice first. The verifier
proves that representative legacy v0.2 and complete v0.3 prescriptions pass,
an incomplete object fails, and the installed constraint contains both format
markers. The migration passed production apply-twice, rollback-only
verification, independent row-count and constraint readback, and direct
RLS/privilege/trigger inspection on July 29, 2026. See
`coach-complete-programming-v0-3-production-application-2026-07-29.md`.

### `verify-coach-execution-feedback-migration.sql`
Rollback-only verification for completed and skipped results, identical retry,
mismatched retry rejection, cross-user isolation, function execute grants, and
removal of authenticated direct table writes. Apply the execution-feedback
migration twice before running it. This verifier has not been run against
production.

### `verify-layered-adaptive-evidence-migration.sql`
Rollback-only verification for import and source idempotency, canonical-workout
and lineage ownership, memory lifecycle representation, forced RLS, and table
privileges. Apply the base workout schema, coach-system migration, and layered
adaptive evidence migration twice before running it. This verifier has not been
run against production. See
`layered-adaptive-evidence-verification-2026-09-01.md` for the disposable
PostgreSQL-compatible apply-twice and rollback-verifier evidence.

### `verify-qwik-vbt-import-migration.sql`
Rollback-only verification for Qwik manifest and observation persistence,
authenticated-only RPC execution, normalized-only storage, trust state,
idempotent replay, duplicate detection, mismatched retry rejection, atomic
failure, and cross-user isolation. Apply the layered evidence and Qwik
migrations twice before running it. This verifier has not been run against
production. See `qwik-vbt-import-verification-2026-09-01.md`.
### `verify-coach-trust-review-migration.sql`
Rollback-only verification for append-only review history, memory lifecycle,
explicit Qwik mapping and rejection, proposal rejection, idempotency, grants,
forced RLS, normalized-only storage, and cross-athlete isolation. Apply the base
workout, coach-system, layered evidence, Qwik, and trust migrations first, with
the trust migration applied twice. This verifier has not been run against
production. See
`coach-trust-review-verification-2026-09-01.md` for the disposable PostgreSQL
apply-twice and rollback-verifier evidence.


### `verify-nutrition-fast-logging.sql`
Rollback-only structural, grant, idempotency, source-meal ownership, and
two-user RLS verification for the nutrition fast-log migration. It requires two
existing auth users and rolls back every catalog and meal fixture.

### `verify-secure-legacy-database-objects.sql`
Rollback-only structural and privilege verification for the legacy-object
containment migration. Apply the forward migration twice first. The verifier
checks forced RLS, absence of Data API user privileges, retained service-role
maintenance access, invoker and search-path function hardening, executable SQL,
and unchanged backup-table row counts.

## Migration History

### Phase 1: Base Schema (January 2026)
- User profiles
- Workout tracking
- Movement library

### Phase 2: Food Tracking (January 2026)
- Meal logging with photo support
- Macro tracking
- Daily targets and summaries

### Phase 3: WHOOP Integration (January 2026)
- OAuth token management with encryption
- Recovery, sleep, strain data
- Automatic sync

### Phase 4: Cross-Domain Analytics (January 2026)
- Fitness correlations
- Holistic query system
- Daily fitness summaries

### Phase 5: WHOOP v2 Schema Fix (February 2026)
- Verified schema supports UUID identifiers
- No migration needed (schema already correct)
- See `WHOOP-V2-SCHEMA-STATUS.md`

## How to Use

### For New Deployments
Run `complete-holistic-migration.sql` to create the full schema.

### For Schema Verification
Run `verify-whoop-schema.sql` to check current state.

### For Incremental Updates
Run the relevant incremental migration, repeat it to prove idempotence, and then
run its verification script. Do not run a historical aggregate migration over
an existing production schema without first reconciling it against the live
database.

## Important Notes

1. **RLS Policies:** All user tables have row-level security enabled
2. **Encryption:** WHOOP tokens are encrypted with AES-256-GCM
3. **Indexes:** User ID columns are indexed for performance
4. **Data Types:** 
   - WHOOP sleep/workout IDs: TEXT (UUID strings)
   - WHOOP cycle IDs: TEXT (integers or UUIDs)
   - User IDs: UUID
   - Timestamps: TIMESTAMPTZ

## Related Documentation

- Schema status: `WHOOP-V2-SCHEMA-STATUS.md`
- Deployment summary: `DEPLOYMENT-SUMMARY-2026-02-05.md`
- Architecture: `../architecture/ARCHITECTURE-MAP.md`
- Setup guide: `../guides/SETUP-GUIDE.md`

---

**Last Updated:** September 1, 2026
