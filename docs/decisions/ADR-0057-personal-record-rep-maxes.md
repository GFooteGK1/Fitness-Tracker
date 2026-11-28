# ADR-0057 - Personal records from completed rep-max sets

- **Status** — Accepted scope on November 27, 2026. Production approval is pending.
- **Related** — [ADR-0044](ADR-0044-chatgpt-activity-record-operations.md) and [ADR-0055](ADR-0055-routine-production-release-authority.md).

## Decision

The workout capture transaction projects Personal Records from performed sets. Each record identifies one lift and exactly 1, 3, or 5 reps. The first eligible set establishes a baseline. A later workout registers an improvement when its heaviest comparable set exceeds the previous best. Records use the saved workout date and pounds as the comparison unit.

The approved lifts are Bench Press, Clean, Clean and Jerk, Snatch, Front Squat, Overhead Squat, Jerk, Push Press, Strict Press, Power Clean, Power Clean and Jerk, and Power Snatch. Paused bench counts as Bench Press. The three power lifts have independent histories. Workout history retains the movement label originally recorded by the athlete.

Use explicit comparable set evidence from completed workouts with athlete-confirmed or corrected quantities in the existing audited capture formats. Backfill from the same evidence. Direct reviewed-program completion stores reported movements in a separate format. Older generic PR rows lack exact set identity and remain available to legacy storage consumers. Updated Personal Records readers select the new rep-max types. Named workout benchmarks continue through their own projection.

## Alternatives considered

- Filter the existing records in the app. Generic weight rows have no exact rep count, and the workout capture transaction would continue creating volume records.
- Recompute full history for every request. This would make workout logs the direct read source but repeat the same work across the web and ChatGPT readers. The existing transaction already refreshes affected projections on save, correction, and deletion.

## Release and recovery

Test the migration and the app together with disposable records. Reconcile the production target and pending migrations, and get separate production migration approval before triggering the release. Verify compatibility with the identified application fallback. Earlier clients can read the existing table but do not have labels or filters for the new types. A production rollback plan must account for the app and the projection function.
