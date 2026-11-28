# ADR-0057 - Personal records from completed rep-max sets

- **Status** — Scope and production rollout approved on November 27, 2026, subject to the release checks.
- **Related** — [ADR-0044](ADR-0044-chatgpt-activity-record-operations.md) and [ADR-0055](ADR-0055-routine-production-release-authority.md).

## Decision

The workout capture transaction projects Personal Records from performed sets. Each record identifies one lift and exactly 1, 3, or 5 reps. The first eligible set establishes a baseline. A later workout registers an improvement when its heaviest comparable set exceeds the previous best. Records use the saved workout date and pounds as the comparison unit.

The approved lifts are Bench Press, Clean, Clean and Jerk, Snatch, Front Squat, Overhead Squat, Jerk, Push Press, Strict Press, Power Clean, Power Clean and Jerk, and Power Snatch. Paused bench counts as Bench Press. The three power lifts have independent histories. Workout history retains the movement label originally recorded by the athlete.

Use explicit comparable set evidence from completed workouts with athlete-confirmed or corrected quantities in the existing audited capture formats. Backfill from the same evidence. Direct reviewed-program completion stores reported movements in a separate format. Older generic PR rows lack exact set identity and remain available to legacy storage consumers. Updated Personal Records readers select the new rep-max types. Named workout benchmarks continue through their own projection.

## Alternatives considered

- Filter the existing records in the app. Generic weight rows have no exact rep count, and the workout capture transaction would continue creating volume records.
- Recompute full history for every request. This would make workout logs the direct read source but repeat the same work across the web and ChatGPT readers. The existing transaction already refreshes affected projections on save, correction, and deletion.

## Release and recovery

Test the migration and the app together with disposable records. Release an app-only version that reads legacy and rep-max records before merging the migration. Verify that deployment on the production domain and retain it as the Vercel rollback target. The previous application lacks labels and filters for rep-max records.

Reconcile the production target and pending migrations before merging. The configured Supabase Git integration applies the approved SQL on `main`. Verify the exact ledger version and catalog state, then verify that the expected Vercel application serves the canonical domain. An application rollback uses the compatible build with the migrated database. Database recovery requires separate approval.
