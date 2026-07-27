# Database Migrations

This directory contains SQL migration scripts for the SociusFit database schema.

## Current Schema Status

**Last Verified:** July 27, 2026
**Status:** Existing production schema and all three incremental migrations are live and verified

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

### `view-templates-migration.sql`
Incremental, repeatable storage for immutable ADR-0001 presentation templates,
including the default dashboard template and forced RLS.

### `view-compositions-migration.sql`
Live incremental migration for ephemeral, user-scoped AI-composed view
cache entries. Cache identity includes local day, template version/content, and
deterministic facts content. Forced RLS ensures authenticated users can access
only their own cached presentation.

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

**Last Updated:** July 27, 2026
