# Exercise preferences release — 2026-09-16

Release branch: `codex/exercise-preferences-release`, based on main `688dfcf`.
This contains only the favorites feature and preserves current shared UI styling.
Paused coaching-model experiments, specialist prescriptions, and signal-layer
work from the development worktree are outside this release.

## Behavior

Optional favorite movements and broader interests persist as versioned confirmed
memory. Skip preserves the saved answer; explicit none and removal of the final
favorite clear it. Trust corrections are replay-safe. New-program, conversion,
and changed-direction drafts use current preferences. Held weekly doses retain
accepted anchors. Unsupported interests are visible; no proficiency or new goal
is inferred. Existing ownership and plan-acceptance boundaries remain in force.

## Verification before deployment

- Full local suite: 2,486 passed, 7 skipped before final-removal regression addition.
- Final-item removal and trust correction focused checks: 9 passed.
- TypeScript and lint pass; build and protected CI are release gates.
- Five executable PostgreSQL checks pass against actual migration/RPCs on synthetic prerequisites.
- Production correction function checked against the reviewed prerequisite; only line-ending differences.
- Live Supabase project verified as `auolnfwetmfcwhtvakzy` / fitness-tracker.

## Deployment order and rollback

Apply only `20260915220000_exercise_preferences.sql` transactionally and record the
migration in Supabase history. Enable `COACH_EXERCISE_PREFERENCES_ENABLED=true` for
the release after migration readback. Merge only when required PR checks pass;
verify the Vercel production deployment and authenticated favorite read/save/edit
behavior. Do not change LLM routing or run paid evaluations.

Rollback disables the flag and redeploys or restores the prior production release.
Keep the additive schema and memory history. Do not delete athlete preferences or
rewrite accepted plans.
