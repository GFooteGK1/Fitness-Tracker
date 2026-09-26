# ADR-0029: Fractional workout effort and failed-save recovery

- Status: Implemented locally; hosted activation pending
- Date: 2026-09-26
- Tracker: Fitness-Tracker-h5r

## Context

The legacy workout writer casts session RPE text to INTEGER. A reported 5.5 raises PostgreSQL 22P02 and rolls back the workout and its blocks. The API stores a terminal failed response without no-write certainty. Reusing that identity then replays the failure indefinitely. Capture normalization separately dropped fractional canonical RPE while retaining it in snapshots.

## Decision

Widen the existing workouts.rpe column to NUMERIC, retaining its range constraint. Preserve fractional values in legacy saves, capture commits, and corrections. Keep the existing reported_rpe snapshot contract and existing zero-effort semantics. Do not add a competing effort column or round athlete reports.

Preserve dependent view identities, permissions, security options and return types by replacing reviewed direct dependencies with typed empty definitions inside the migration transaction, widening the column, and restoring their original definitions. Unknown dependencies abort the entire migration.

Recover only the exact legacy terminal failure after an authenticated database proof under the owner advisory lock and request row lock. Require an empty entity ledger and no frozen capture payload, child operations or related mutations. Return a recovery response without rewriting the historical receipt or reopening its identity. A fresh user submission obtains a new identity; the old identity cannot accept a late save.

For future legacy SQL data/constraint failures, mark the failed statement as confirmed unwritten. The receipt finalizer still checks for any earlier saved entities. Transport failures and unavailable proof remain uncertain.

## Consequences

The database migration must precede the application release. Numeric widening requires a table lock; schedule a short controlled release. Roll back application behavior if needed, retaining the widened column and repaired writer. Do not narrow to INTEGER after fractional records exist. No production records, historic receipts, programming authority or feature flags change as part of local implementation.

See [release and recovery procedure](../releases/workout-save-recovery-2026-09-26.md).
