# Database Migrations

This directory contains SQL migration scripts for the SociusFit database schema.

## Current Schema Status

**Last Verified:** February 5, 2026  
**Status:** ✅ Production Ready

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

## Verification Scripts

### `verify-whoop-schema.sql`
Comprehensive verification script that checks:
- Column data types
- Unique constraints
- RLS policies
- Indexes
- Data integrity (no NULL user_ids)

Run this after any schema changes to verify correctness.

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
Individual migration files can be run separately if needed, but the complete migration is recommended.

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

**Last Updated:** February 5, 2026
