# Atomic Coach Session Completion Verification - 2026-09-01

## Scope

This is local database and application evidence for
`atomic-coach-session-completion-migration.sql`. The migration was later applied
to production after explicit approval; this record does not claim that the
application route was deployed or exercised against live athlete state.

The harness used PGlite 0.5.8, which reports PostgreSQL 18.3, with a minimal
prerequisite schema for the existing coach, workout, check-in, and layered
observation tables. It then applied the existing execution-feedback migration,
the layered-adaptive-evidence migration, and the atomic completion migration.

## Runtime proof

The atomic migration applied successfully two times to the same disposable
database. The rollback-only verifier then completed and rolled back all fixture
changes.

The verifier exercised these behaviors:

- An `as_prescribed` result creates one canonical workout, one session check-in,
  the automatic session-RPE observation, and the prescribed-session link in one
  transaction.
- An identical idempotent replay returns the original IDs, including after the
  active plan changes.
- A mismatched request that reuses the idempotency key fails closed.
- A modified result stores actual work blocks and a supplied typed observation.
- A skipped result creates no workout or performed-session observation.
- Terminal, stale-plan, and cross-user attempts fail closed.
- The legacy `record_coach_session_result` function remains callable for legacy
  check-in-only results.
- Public and anonymous execution remain revoked; authenticated execution is
  limited to the bounded v2 function.

Harness output:

```json
{
  "applyCount": 2,
  "verifier": "rollback-complete",
  "database": "PostgreSQL 18.3 (PGlite 0.5.8)"
}
```

## Static and application proof

The focused migration, input-contract, coach-context, and API-route slice
passed 26 tests. The later purpose-specific context and agent regression slice
passed 113 tests across six files. The adaptation regression passed 77 tests
across 11 files. The Today, atomic completion, runtime projection, page, and API
regression passed 32 tests across six files. The final full Vitest run passed
210 files and 2,346 tests;
five files and seven environment-gated tests were skipped.

TypeScript typecheck and Next.js lint passed. A production build compiled and
generated all 76 routes with non-secret build-only public Supabase
placeholders. `git diff --check` passed. Both the atomic-completion and layered
evidence canonical SQL files exactly match their timestamped Supabase migration
mirrors. The migration test independently enforces the atomic mirror match.

These checks validate local code, SQL structure, and disposable PostgreSQL
runtime behavior. Production migration history, live objects, an empty dry run,
and database lint were independently read back after the authorized application
on September 1, 2026; see
`adaptive-coach-production-application-2026-09-01.md`. Direct production
execution of the apply-twice and rollback-only verifier remains unverified. The
application route and authenticated synthetic canary remain undeployed and
unverified.
