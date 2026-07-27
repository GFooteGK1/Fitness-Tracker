# Adaptive Coach Migration Verification — 2026-07-27

## Scope

This record covers:

- `coach-system-migration.sql`
- `verify-coach-system-migration.sql`

Production was not modified.

## Disposable target

- Project: `fitness-tracker-coach-test`
- Initial foundation ref: `ztbbkreyvqcvhufzczmx`
- Final UI-contract ref: `ctfqaejfttqlcobbelnh`
- Organization: Personal Projects (`xwwgbkrcafrdaguwayns`)
- Region: East US (`us-east-1`)
- PostgreSQL: 17.6
- Plan: Free
- Production data: none

The rollback verifier creates two synthetic `auth.users` identities inside its
transaction and removes them with the final `ROLLBACK`.

## Results

1. Applied `coach-system-migration.sql`: success.
2. Applied it again without changes: success.
3. Hardened the privileged RPCs to use an empty `search_path` and added
   composite indexes in foreign-key column order after current Supabase
   guidance and Database Advisor review.
4. Added the atomic, idempotent `create_initial_training_plan_proposal` RPC,
   then applied the final migration twice on a fresh project: success.
5. Ran `verify-coach-system-migration.sql`: success. The rollback-only script
   exercised two authenticated identities, forced RLS, assessment and memory
   idempotency, mismatched-memory rejection, atomic initial-proposal creation,
   proposal retry and mismatched-payload rejection, initial activation,
   acceptance retry, replacement activation, stale-proposal rejection, and
   cross-user isolation.
6. Ran independent post-verification readback:

| Check | Result |
| --- | --- |
| Coach tables present | 7 of 7 |
| RLS enabled and forced | true on all 7 tables |
| Fixture rows after rollback | 0 on all 7 tables |
| Authenticated table grants | least privilege; no anonymous grants |
| RLS policies | 11 expected policies across 7 tables |
| Tenant-consistent foreign keys | present |
| `accept_adaptation_proposal` | definer, empty `search_path`, authenticated/service only |
| `confirm_coach_memory` | definer, empty `search_path`, authenticated/service only |
| `create_initial_training_plan_proposal` | definer, empty `search_path`, authenticated/service only |

Security Advisor reported three warnings because the three authenticated RPCs are
intentionally `SECURITY DEFINER`. That access is the design: each function
derives the caller from `auth.uid()`, checks row ownership, uses fully qualified
objects with an empty `search_path`, and exists to perform a narrow atomic write
that direct table grants do not permit. Anonymous and `PUBLIC` execution are
revoked.

Performance Advisor reported no unindexed foreign keys after hardening. Its
remaining information-level findings were unused indexes, which is expected on
a new empty database and is not evidence that the indexes should be removed.

## Cleanup

Both disposable projects were permanently deleted after their verification
passes. Supabase confirmed deletion, the organization project list returned to the single
healthy production `fitness-tracker` project (`auolnfwetmfcwhtvakzy`), and the
temporary DPAPI-encrypted database-password file was removed. The disposable
project had no application, GitHub, or Vercel integration.
