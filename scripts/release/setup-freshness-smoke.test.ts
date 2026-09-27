import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { recommendationFixture } from '../../test/database/recommendation-fixture'
import { sqlFile } from '../../test/database/fixture'
import { GOLDEN_PROGRAMMING_PROFILES } from '../../test/coach/golden-programming-profiles'
import { buildRollingTrainingDirection } from '../../app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan } from '../../app/lib/coach/rolling-weekly-plan'
import { buildAdaptivePlanContract } from '../../app/lib/coach/adaptive-plan'
import { buildStoredRollingWeeklyIntent, serializeRollingSessions } from '../../app/lib/coach/rolling-weekly-api'
import { renderSetupInstallSql, SETUP_PREDECESSOR_SQL, setupMigrationSource } from './setup-freshness-install.mjs'

// Ordered PostgreSQL release rehearsal, not concurrent-session or hosted HTTP proof.
let db: PGlite
const owner = randomUUID(), freshOwner = randomUUID()
const profile = GOLDEN_PROGRAMMING_PROFILES[0].profile
const plan = buildRollingWeeklyPlan({ source: 'initial', windowStart: profile.startDate, profile,
  direction: buildRollingTrainingDirection(profile, { hypothesis: 'Synthetic release rehearsal' }) })
if (plan.kind !== 'weekly_plan') throw new Error('Synthetic week must compile')
const intent = buildStoredRollingWeeklyIntent(plan, buildAdaptivePlanContract(profile, [plan]))
const setupMemoryBindings = { schemaVersion: 1, memories: { primary_goal: null, training_schedule: null,
  available_equipment: null, training_constraints: null } }
const rpc = async (name: string, args: unknown[]) => (await db.query<Record<string, any>>(
  `SELECT * FROM ${name}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args)).rows[0]
const actor = async (id = owner) => { await db.exec('SET ROLE authenticated'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]) }
const gate = async (paused: boolean) => {
  await db.exec('RESET ROLE')
  const row = (await db.query<{ generation: number }>('SELECT generation FROM coaching_write_control')).rows[0]
  return rpc('set_coaching_write_pause', [paused, row.generation, 'Isolated setup freshness release rehearsal'])
}
const proposal = async (bound: boolean, key: string) => {
  const contextRevision = (await rpc('get_coach_context_revision', [])).get_coach_context_revision
  return rpc('create_initial_rolling_weekly_proposal', [plan.title, profile.athleteGoalSummary, plan.windowStart, null,
    plan.directionSnapshot, plan.evidenceReferenceVersion, plan.policyVersion, intent,
    { contextRevision, ...(bound ? { setupMemoryBindings } : {}) }, serializeRollingSessions(plan), {}, 'a'.repeat(64), key])
}
const digest = async () => (await db.query(`SELECT p.id,md5(p.intent::text || p.input_snapshot::text) AS hash,
  (SELECT md5(string_agg(s.prescription::text,'' ORDER BY s.id)) FROM prescribed_sessions s WHERE s.plan_version_id=p.id) sessions
  FROM training_plan_versions p WHERE p.user_id=$1 ORDER BY p.id`, [owner])).rows

beforeAll(async () => {
  db = await recommendationFixture()
  await db.exec(sqlFile('supabase/migrations/20260921010000_coach_proposal_context_revision.sql'))
  await db.exec(sqlFile('supabase/migrations/20260923010000_coaching_write_pause.sql'))
  // Mirror current production ordering: the newer workout migration is already installed.
  await db.exec(sqlFile('supabase/migrations/20260926120000_workout_save_recovery.sql'))
  await db.exec('CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[])')
  // Explicit synthetic ledger built from actual migration bytes, not hosted-state evidence.
  for (const [version, name] of [['20260921010000', 'coach_proposal_context_revision'], ['20260923010000', 'coaching_write_pause'], ['20260926120000', 'workout_save_recovery']]) {
    await db.query('INSERT INTO supabase_migrations.schema_migrations VALUES($1,$2,$3)', [version, name, [sqlFile(`supabase/migrations/${version}_${name}.sql`)]])
  }
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [owner, freshOwner])
}, 30_000)
afterAll(async () => { await db?.close() })

describe('setup freshness coordinated upgrade on current main', () => {
  it('installs while paused, rejects old writers, preserves accepted replay, and accepts a fresh bound compiled week after resume', async () => {
    await actor()
    const key = randomUUID(), old = await proposal(false, key)
    const accepted = await rpc('accept_adaptation_proposal', [old.proposal_id, key])
    const before = await digest()
    await gate(true); await actor(freshOwner)
    await expect(proposal(true, randomUUID())).rejects.toMatchObject({ code: 'PT503' })
    await actor()
    expect(await rpc('accept_adaptation_proposal', [old.proposal_id, key])).toEqual(accepted)
    await db.exec('RESET ROLE')
    const predecessors = (await db.query<{ signature: string; md5: string }>(SETUP_PREDECESSOR_SQL)).rows
    const expectedGeneration = String((await db.query<{ generation: number }>('SELECT generation FROM coaching_write_control')).rows[0].generation)
    const productionSql = renderSetupInstallSql({ expectedGeneration, predecessors })
    // PGlite is PG18. Prove the production identity guard refuses it, then change
    // only this one major-version predicate for the isolated SQL contract test.
    await expect(db.exec(productionSql)).rejects.toMatchObject({ code: '55000' })
    await db.exec('ROLLBACK')
    const localSql = (sql: string) => {
      const guard = "current_setting('server_version_num')::integer / 10000 <> 17"
      expect(sql.split(guard)).toHaveLength(2)
      return sql.replace(guard, "current_setting('server_version_num')::integer / 10000 <> 18")
    }
    const rollbackFailure = async (sql: string) => {
      await expect(db.exec(localSql(sql))).rejects.toMatchObject({ code: '55000' })
      await db.exec('ROLLBACK')
      expect((await db.query("SELECT to_regprocedure('public.assert_coach_setup_memories_current(uuid,jsonb,jsonb)') helper")).rows[0]).toEqual({ helper: null })
      expect((await db.query("SELECT count(*)::int n FROM supabase_migrations.schema_migrations WHERE version='20260926010000'")).rows[0]).toEqual({ n: 0 })
    }
    await rollbackFailure(renderSetupInstallSql({ expectedGeneration: '999', predecessors }))
    await rollbackFailure(renderSetupInstallSql({ expectedGeneration, predecessors: predecessors.map((p, i) => i ? p : { ...p, md5: '0'.repeat(32) }) }))
    await db.exec(localSql(productionSql))
    expect((await db.query("SELECT name,statements FROM supabase_migrations.schema_migrations WHERE version='20260926010000'")).rows)
      .toEqual([{ name: 'coach_setup_memory_bindings', statements: [setupMigrationSource()] }])
    await expect(db.exec(localSql(productionSql))).rejects.toMatchObject({ code: '55000' })
    await db.exec('ROLLBACK')
    expect((await db.query('SELECT paused FROM coaching_write_control')).rows).toEqual([{ paused: true }])
    await actor()
    expect(await rpc('accept_adaptation_proposal', [old.proposal_id, key])).toEqual(accepted)
    expect(await digest()).toEqual(before)
    await actor(freshOwner)
    await expect(proposal(true, randomUUID())).rejects.toMatchObject({ code: 'PT503' })
    await gate(false); await actor(freshOwner)
    // A different owner isolates first-program creation from the existing accepted program.
    await expect(proposal(false, randomUUID())).rejects.toMatchObject({ code: '40001' })
    const freshKey = randomUUID(), fresh = await proposal(true, freshKey)
    expect((await rpc('accept_adaptation_proposal', [fresh.proposal_id, freshKey])).proposal_status).toBe('accepted')
    await gate(true); await actor()
    expect(await rpc('accept_adaptation_proposal', [old.proposal_id, key])).toEqual(accepted)
    expect(await digest()).toEqual(before)
    await db.exec('RESET ROLE')
    expect((await db.query("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='workouts' AND column_name='rpe'")).rows).toEqual([{ data_type: 'numeric' }])
  })
})
