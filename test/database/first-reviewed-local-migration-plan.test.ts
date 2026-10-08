import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { supervisedLifecycleFixture, lifecycleIds } from './supervised-lifecycle-fixture'
import { sqlFile } from './fixture'
import { buildSupervisedMigrationPlan } from '../../scripts/release/supervised-local-migration-plan.mjs'
import { buildFirstReviewedLocalMigrationPlan } from '../../scripts/release/first-reviewed-local-migration-plan.mjs'

describe('fixed-local first-reviewed additive migration plan (disposable SQL)', () => {
  let f: Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  beforeEach(async () => {
    f = await supervisedLifecycleFixture(true, true, true)
    for (const file of buildSupervisedMigrationPlan().manifest.files.slice(2)) await f.db.exec(sqlFile(`supabase/migrations/${file.name}`))
    await f.db.exec('RESET ROLE')
    // Mirror the observed retained synthetic-local ACL, not a new target grant.
    // The canonical migration fixture grants this function only to authenticated.
    await f.db.exec('GRANT EXECUTE ON FUNCTION confirm_coach_memory(text,text,jsonb,jsonb,numeric,text) TO service_role')
  }, 30000)
  afterEach(async () => { if (f) { await f.db.exec('ROLLBACK; RESET ROLE'); await f.db.close() } })
  // The actual fixed target is PG17; this disposable PGlite engine is PG18.
  const fixtureSql = () => buildFirstReviewedLocalMigrationPlan().sql.replace(
    "current_setting('server_version_num')::integer/10000<>17", "current_setting('server_version_num')::integer/10000<>18")
  it('refuses the wrong major version before installing any object', async () => {
    const plan = buildFirstReviewedLocalMigrationPlan()
    expect(plan.manifest).toMatchObject({kind:'first_reviewed',target:'supabase_db_sociusfit-programming-local',api:'http://127.0.0.1:55321'})
    expect(plan.manifest.files).toHaveLength(5)
    await expect(f.db.exec(plan.sql)).rejects.toThrow('Unexpected local database')
    await f.db.exec('ROLLBACK')
    expect(await f.scalar("SELECT to_regclass('coach_first_review_designations') AS value")).toBeNull()
  })
  it('installs the entire batch atomically, preserves accepted rows, creates no designation/enrollment and refuses replay', async () => {
    const old = await f.scalar('SELECT to_jsonb(v) AS value FROM training_plan_versions v WHERE id=$1', [lifecycleIds.base])
    await f.db.exec(fixtureSql())
    expect(await f.scalar('SELECT to_jsonb(v) AS value FROM training_plan_versions v WHERE id=$1', [lifecycleIds.base])).toEqual(old)
    for (const table of ['coach_first_review_designations','coach_first_review_setup_requests','coach_first_review_acceptances','coach_supervised_enrollments']) {
      expect(await f.scalar(`SELECT count(*)::int AS value FROM ${table}`)).toBe(0)
    }
    await expect(f.db.exec(fixtureSql())).rejects.toThrow(/already or partially applied/)
  })
  it('rejects predecessor definition drift before DDL', async () => {
    await f.db.exec("ALTER FUNCTION correct_coach_memory_with_review(uuid,jsonb,text) SET lock_timeout='2s'")
    await expect(f.db.exec(fixtureSql())).rejects.toThrow(/predecessor definition changed/)
  })
  it('rejects expanded predecessor grants before DDL', async () => {
    await f.db.exec('GRANT EXECUTE ON FUNCTION accept_adaptation_proposal(uuid,text) TO service_role')
    await expect(f.db.exec(fixtureSql())).rejects.toThrow(/predecessor privileges changed/)
  })
  it('rejects a partial previous installation', async () => {
    await f.db.exec('CREATE TABLE coach_first_review_setup_requests(id uuid)')
    await expect(f.db.exec(fixtureSql())).rejects.toThrow(/already or partially applied/)
  })
  it('rejects a function-only partial installation before creating first-review tables', async () => {
    await f.db.exec("CREATE FUNCTION list_first_review_programs(uuid,integer) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$")
    await expect(f.db.exec(fixtureSql())).rejects.toThrow(/already or partially applied/)
    await f.db.exec('ROLLBACK')
    expect(await f.scalar("SELECT to_regclass('coach_first_review_designations') AS value")).toBeNull()
  })
  it('rolls back the entire batch if its late preservation check detects a changed old row', async () => {
    const old = await f.scalar('SELECT title AS value FROM training_programs WHERE id=$1', [lifecycleIds.program])
    const corrupt = fixtureSql().replace('DO $preserve$', "UPDATE training_programs SET title='Injected preservation failure';\nDO $preserve$")
    await expect(f.db.exec(corrupt)).rejects.toThrow(/Existing data changed in public.training_programs/)
    await f.db.exec('ROLLBACK')
    expect(await f.scalar('SELECT title AS value FROM training_programs WHERE id=$1', [lifecycleIds.program])).toBe(old)
    expect(await f.scalar("SELECT to_regclass('coach_first_review_designations') AS value")).toBeNull()
  })
})
