# Workout save recovery — September 26, 2026

Tracker: Fitness-Tracker-h5r. Status: locally implemented; not deployed.

## Evidence and scope

Read-only production inspection found a completed failed workout-text request from September 25, 07:22 CDT, with HTTP 500, retryAllowed=false, no recorded entities and no capture children. No workout was found for September 24–26 in the inspected account. The stored error was `Failed to parse workout` with `Unable to save the complete activity. Check history before retrying.` The original model response and SQL error code were not retained.

Local PostgreSQL reproduction using the supplied session RPE 5.5 raises 22P02 in the old INTEGER cast. The transaction saves neither workout nor block rows. Replaying the completed request repeats its old failure. This explains the reported behavior; the precise historical model value remains unverified.

The fix preserves fractional RPE in the existing canonical column, capture snapshots and corrections. The recovery RPC confirms narrowly defined legacy failed requests are unwritten. It never resets a request, deletes a receipt or automatically logs the supplied workout. Uncertain network outcomes retain the original identity.

## Authorized release required

1. Target Supabase project `auolnfwetmfcwhtvakzy` and the SociusFit application serving `www.sociusfit.com`. Confirm the latest base/schema before release. Preview shares the production database; do not run synthetic writes against it as an isolated canary.
2. Record the installed writer definitions and dependent view OIDs, owners, grants, reloptions and definitions. Confirm the capture schema is installed, including logging_requests.frozen_items, logging_request_items and activity_mutations. Direct views depending on workouts.rpe must be the reviewed public agent_daily_workout_context and/or daily_fitness_summary. Unknown dependencies cause an atomic abort; do not bypass that check.
3. Apply only `supabase/migrations/20260926120000_workout_save_recovery.sql` in a controlled release window, with a short lock timeout. It changes the column and writers in one transaction. Check successful commit and migration ledger recording. Avoid replaying unrelated historical migrations.
4. Read back numeric column type, retained range constraint, writer numeric casts, unchanged view definitions/OIDs/security options/grants, and authenticated-only confirm_failed_workout_request execution. Verify the dependent daily context function still reads successfully under the actual athlete session.
5. Deploy the reviewed application change. Keep existing feature flags unchanged. Refresh the browser so it uses the new recovery response handling.
6. Under Greg's signed-in session, check the pending failed workout. After confirmed no-write proof, select **Log another occurrence** and submit the original entry with September 25 selected. Alternatively, submitting the unchanged form first releases the old failed identity with a clear message; submitting again uses a new identity. This release does not auto-submit or alter the workout.
7. Confirm exactly one workout and its complete block records, date September 25 and session RPE 5.5. Verify retained set-level details against the submitted text. A repeated request must return the same workout ID. These live writes and readbacks require separate release/workout authorization.

## Rollback and limits

If migration validation fails, roll back the whole transaction and investigate the named dependency/definition. Do not partially run it or use CASCADE. If application rollback is needed after release, retain the widened numeric schema and repaired SQL writer. Do not narrow RPE or round existing values. The old app can still show the old recovery problem, so recovery requires the updated application.

Missing proof RPCs, schema errors and network loss fail closed. Existing failed receipts stay unchanged for audit. This fix does not reconstruct lost historical parser output or repair unrelated session-completion rounding.

## Local validation

Executable PGlite tests reproduce the old 22P02 and exercise the migration twice against the current recommendations schema. They verify exact 5.5 save, block detail, integer/null/range behavior, capture correction to 6.5, immutable snapshots, RLS, view identity/security preservation, unknown-dependency rollback, late-write rejection, ownership checks, and refusal of pending/frozen/child/mutation/saved outcomes.

API, component and client regressions cover authenticated proof, unavailable proof, GET/POST/replay recovery without a provider rerun, preserved text/date, fresh identity only after no-write proof, and no false saved receipt. Full local checks and browser results are recorded in the investigation handoff.

Final full regression: 3,049 passed, 19 skipped, zero failures. TypeScript, lint, production build and diff checks passed. Independent source review found no actionable findings. A local mobile browser journey with simulated services confirmed recovery guidance, explicit release, fresh identity, retained date/text, cleared pending storage and a success message. It does not establish live-provider or production-save success. The existing v2 lint warning and log-page date-prefill hydration warning remain documented in the handoff.
