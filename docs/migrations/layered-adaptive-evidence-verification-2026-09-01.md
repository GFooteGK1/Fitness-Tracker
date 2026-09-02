# Layered Adaptive Evidence Migration Verification

Date: September 1, 2026

Scope: local disposable verification only. The migration was not applied to a
Supabase project or production database.

## Result

The canonical migration and its timestamped Supabase mirror are byte-identical.
The migration applied twice to a fresh in-memory PostgreSQL 18.3-compatible
PGlite database. The rollback-only verifier then completed successfully.

The disposable prerequisite schema reproduced the migration dependencies that
matter to this change: Supabase-style `anon`, `authenticated`, and
`service_role` roles; `auth.users` and `auth.uid()`; canonical `workouts`;
`coach_memories`; and `prescribed_sessions`.

## Verified behavior

- A repeated migration apply succeeds.
- A second active import with the same athlete, source system, and SHA-256 file
  hash fails, including when a different parser version is used.
- A second active observation for the same source record fails.
- An observation cannot link an athlete to another athlete's workout.
- Import source identity and observation content or values cannot be rewritten.
- An excluded observation cannot be silently returned to an active status.
- Derived-observation lineage cannot cross athlete ownership.
- Withdrawn and expired coach memory remains representable with effective and
  review timestamps.
- All four new evidence tables have enabled and forced RLS.
- `authenticated` can select only owned rows and has no direct write grant.
- `anon` has no table access, while `service_role` retains bounded application
  maintenance authority.
- All verifier fixtures roll back.

## Local evidence

```text
applyCount: 2
verifier: rollback-complete
database: PostgreSQL 18.3 (PGlite 0.5.8)
```

Static Vitest coverage also checks the canonical/mirror equality, migration
shape, memory lifecycle fields, private raw-artifact references, canonical
workout ownership, idempotency indexes, immutable-content triggers, RLS and
grants, and rollback-only verifier markers.

## Production status

The canonical migration was applied to production after explicit approval on
September 1, 2026. Migration history, live object readback, an empty dry run,
and database lint passed; the new tables had zero rows after application. Direct
production execution of the apply-twice and rollback-only verifier remains
unverified. See `adaptive-coach-production-application-2026-09-01.md`.
