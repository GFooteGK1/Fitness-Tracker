# Database Migrations

This directory contains SQL migration scripts for the SociusFit database schema.

## Current Schema Status

**Last Verified:** July 29, 2026
**Status:** Production-applied migrations, including complete-programming v0.3 compatibility, are live and verified

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

### `verify-nutrition-fast-logging.sql`
Rollback-only structural, grant, idempotency, source-meal ownership, and
two-user RLS verification for the nutrition fast-log migration. It requires two
existing auth users and rolls back every catalog and meal fixture.

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

**Last Updated:** July 29, 2026
