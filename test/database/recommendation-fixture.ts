import { databaseFixture, sqlFile } from './fixture'
export async function recommendationFixture() {
 const db=await databaseFixture()
 for(const file of ['coach-system-migration.sql','coach-plan-replacement-migration.sql','coach-complete-programming-v0-3-migration.sql','coach-execution-feedback-migration.sql','layered-adaptive-evidence-migration.sql','atomic-coach-session-completion-migration.sql','qwik-vbt-import-migration.sql','coach-trust-review-migration.sql','rolling-weekly-coach-migration.sql'])await db.exec(sqlFile(`docs/migrations/${file}`))
 for(const file of ['20260728143952_nutrition_fast_logging.sql','20260730130953_coach_workout_runner_v0_5.sql','20260904023000_fix_atomic_session_workout_link.sql','20260904120000_logging_receipts.sql','20260915220000_exercise_preferences.sql','20260918010000_optional_session_feedback.sql','20260918011000_session_capture_signals.sql'])await db.exec(sqlFile(`supabase/migrations/${file}`))
 await db.exec(sqlFile('docs/migrations/personal-records-migration.sql'))
 await db.exec(sqlFile('supabase/migrations/20260728134202_personal_record_idempotency.sql'))
 for(const file of ['20260918020000_capture_receipts.sql','20260918030000_training_intent.sql','20260918040000_targeted_review_sources.sql'])await db.exec(sqlFile(`supabase/migrations/${file}`))
 const food=sqlFile('docs/migrations/food-tracking-migration.sql'),start=food.indexOf('CREATE TABLE daily_targets (');await db.exec(food.slice(start,food.indexOf('\n);',start)+3))
 // Original WHOOP tables/policies; uuid helper already exists in the fixture.
 await db.exec(sqlFile('docs/migrations/whoop-integration-migration.sql').replace(/CREATE EXTENSION[^;]+;/g,''))
 const migration=sqlFile('supabase/migrations/20260918050000_recommendations.sql');await db.exec(migration);await db.exec(migration)
 return db
}
