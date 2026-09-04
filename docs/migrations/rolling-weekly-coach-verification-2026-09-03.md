# Rolling Weekly Coach Migration Verification

Date: September 3, 2026

Scope: local disposable verification only. The migration was not applied to a
Supabase project or production database.

## Result

The canonical migration and timestamped Supabase mirror are byte-identical.
The migration applied twice to a fresh in-memory PostgreSQL 17.5-compatible
PGlite database. The rollback-only verifier then completed successfully.

The disposable prerequisite schema reproduced the migration dependencies that
matter to this change: Supabase-style `anon`, `authenticated`, and
`service_role` roles; `auth.users` and `auth.uid()`; canonical `workouts`; the
adaptive coach foundation; and layered performance observations.

## Verified behavior

- Existing and newly created legacy rows retain the `legacy_eight_week` mode,
  eight-week horizon, and null rolling-window metadata.
- A rolling plan accepts only a one-week intent and a Monday-through-Sunday
  window.
- The initial proposal stores one weekly version and no future versions.
- Acceptance keeps one accepted version and moves the program's active window
  atomically.
- A second open proposal for the same weekly window fails.
- A weekly review is immutable, linked to its accepted base plan, and safe to
  replay with the same idempotency key and input fingerprint.
- A mismatched retry and a review against a superseded plan fail closed.
- An observation link cannot cross athlete ownership.
- Review tables have enabled and forced RLS. A second athlete cannot read the
  first athlete's reviews or evidence links.
- Authenticated clients can read their records but cannot insert directly into
  programs, plan versions, proposals, reviews, or review-observation links.
- All verifier fixtures roll back.

## Local evidence

```text
applyCount: 2
verifier: rollback-complete
database: PostgreSQL 17.5 (PGlite 0.3.14)
static migration tests: 7 passed
```

## Production status

The migration has not been applied to production. Production migration,
application deployment, and authenticated canary remain separate approval
boundaries.
