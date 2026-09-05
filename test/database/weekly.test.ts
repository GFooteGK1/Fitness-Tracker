import { it, expect } from 'vitest'
import { databaseFixture, sqlFile } from './fixture'

it('executes the complete coach migration chain and weekly SQL verifier', async () => {
  const db = await databaseFixture()
  try {
    const migrations = [
      'coach-system-migration.sql','coach-plan-replacement-migration.sql',
      'coach-complete-programming-v0-3-migration.sql','coach-execution-feedback-migration.sql',
      'layered-adaptive-evidence-migration.sql','atomic-coach-session-completion-migration.sql',
      'qwik-vbt-import-migration.sql','coach-trust-review-migration.sql',
      'rolling-weekly-coach-migration.sql'
    ]
    for (const file of migrations) {
      try { await db.exec(sqlFile(`docs/migrations/${file}`)) }
      catch (error) { throw new Error(`Migration ${file}: ${String(error)}`) }
    }
    await db.exec(sqlFile('supabase/migrations/20260730130953_coach_workout_runner_v0_5.sql'))
    await db.exec(sqlFile('docs/migrations/atomic-coach-session-workout-link-fix-migration.sql'))
    await db.exec(sqlFile('docs/migrations/rolling-weekly-coach-migration.sql'))
    await db.exec(sqlFile('docs/migrations/verify-atomic-coach-session-completion-migration.sql'))
    const results = await db.exec(sqlFile('docs/migrations/verify-rolling-weekly-coach-migration.sql'))
    expect(results.some(result => result.rows.some(row => Object.values(row).includes('rollback-complete')))).toBe(true)
  } finally { await db.close() }
}, 30000)
