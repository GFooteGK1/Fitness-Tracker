import { beforeEach,afterEach,describe,it,expect } from 'vitest'
import { supervisedLifecycleFixture, lifecycleIds } from './supervised-lifecycle-fixture'
import { buildSupervisedMigrationPlan,buildLocalPausePrerequisitePlan,buildLocalIssueClosurePlan } from '../../scripts/release/supervised-local-migration-plan.mjs'
import { sqlFile } from './fixture'
describe('retained-local supervised migration batch',() => {
  let f: Awaited<ReturnType<typeof supervisedLifecycleFixture>>
  beforeEach(async () => { f = await supervisedLifecycleFixture(false,false) },30000)
  afterEach(async () => { await f?.db.close() })
  const fixturePlan = () => buildSupervisedMigrationPlan().sql.replace(
    "current_setting('server_version_num')::integer/10000<>17",
    "current_setting('server_version_num')::integer/10000<>18")
  it('rejects the missing pause prerequisite before DDL and installs it separately without changing existing rows',async()=>{
    await f.db.exec('DROP TABLE coaching_write_control; DROP FUNCTION assert_coaching_writes_open() CASCADE; DROP FUNCTION set_coaching_write_pause(boolean,bigint,text)')
    await expect(f.db.exec(fixturePlan())).rejects.toThrow(/Coaching pause prerequisite missing/)
    await f.db.exec('ROLLBACK')
    expect(await f.scalar("SELECT to_regclass('coach_supervised_programs') AS value")).toBeNull()
    const pause=buildLocalPausePrerequisitePlan().sql.replace("current_setting('server_version_num')::integer/10000<>17","current_setting('server_version_num')::integer/10000<>18")
    await f.db.exec(pause)
    expect(await f.scalar('SELECT paused AS value FROM coaching_write_control')).toBe(false)
    expect(await f.scalar("SELECT count(*) AS value FROM pg_trigger WHERE tgname='coaching_write_pause'")).toBe(6)
    await expect(f.db.exec(pause)).rejects.toThrow(/Pause prerequisite already or partially installed/)
    await f.db.exec('ROLLBACK')
    await f.db.exec(fixturePlan())
  })
  it('applies all additive guards atomically while preserving existing accepted data and rejects replay',async () => {
    const plan = buildSupervisedMigrationPlan()
    expect(plan.manifest.target).toBe('supabase_db_sociusfit-programming-local')
    expect(plan.manifest.files).toHaveLength(6)
    // PGlite0.5.8 is PostgreSQL18; the retained target is17. Prove the real
    // guard rejects this runtime, then change only this fixture's major check.
    await expect(f.db.exec(plan.sql)).rejects.toThrow(/Unexpected local database/)
    await f.db.exec('ROLLBACK')
    const fixtureSql = fixturePlan()
    await f.db.exec(fixtureSql)
    expect(await f.scalar('SELECT count(*) AS value FROM coach_supervised_programs')).toBe(0)
    expect(await f.scalar('SELECT active_plan_version_id AS value FROM training_programs')).toBe(lifecycleIds.base)
    await expect(f.db.exec(fixtureSql)).rejects.toThrow(/already or partially applied/)
    await f.db.exec('ROLLBACK')
  })
  it('applies only the exact old-wrapper correction and rejects a second attempt',async()=>{
    for(const file of buildSupervisedMigrationPlan().manifest.files.slice(0,-1))await f.db.exec(sqlFile(`supabase/migrations/${file.name}`))
    const before=await f.scalar("SELECT md5(replace(pg_get_functiondef('create_registered_reviewed_week_proposal(uuid,text)'::regprocedure),chr(13)||chr(10),chr(10))) AS value")
    expect(before).toBe('1836cb9dc320f8f38b4ed90076e83967')
    const correction=buildLocalIssueClosurePlan().sql.replace("current_setting('server_version_num')::integer/10000<>17","current_setting('server_version_num')::integer/10000<>18")
    await f.db.exec(correction)
    expect(await f.scalar('SELECT active_plan_version_id AS value FROM training_programs')).toBe(lifecycleIds.base)
    await expect(f.db.exec(correction)).rejects.toThrow(/Reviewed predecessor definition changed/)
    await f.db.exec('ROLLBACK')
  })
  it('rejects predecessor configuration drift before creating objects',async () => {
    await f.db.exec("ALTER FUNCTION accept_adaptation_proposal(uuid,text) SET lock_timeout='2s'")
    await expect(f.db.exec(fixturePlan())).rejects.toThrow(/Reviewed predecessor definition changed/)
    await f.db.exec('ROLLBACK')
    expect(await f.scalar("SELECT to_regclass('coach_supervised_programs') AS value")).toBeNull()
  })
  it('rejects predecessor privilege drift before creating objects',async () => {
    await f.db.exec('GRANT EXECUTE ON FUNCTION complete_reviewed_session(uuid,text,jsonb) TO service_role')
    await expect(f.db.exec(fixturePlan())).rejects.toThrow(/Reviewed predecessor privileges changed/)
    await f.db.exec('ROLLBACK')
    expect(await f.scalar("SELECT to_regclass('coach_supervised_programs') AS value")).toBeNull()
  })
  it('rolls back new objects and row changes when the late preservation check fails',async () => {
    const title = await f.scalar('SELECT title AS value FROM training_programs')
    const lateFailure = fixturePlan().replace('DO $preserve$',"UPDATE training_programs SET title='injected late failure';\nDO $preserve$")
    await expect(f.db.exec(lateFailure)).rejects.toThrow(/Existing data changed in public.training_programs/)
    await f.db.exec('ROLLBACK')
    expect(await f.scalar('SELECT title AS value FROM training_programs')).toBe(title)
    expect(await f.scalar('SELECT active_plan_version_id AS value FROM training_programs')).toBe(lifecycleIds.base)
    for (const object of ['coach_supervised_programs','coach_supervised_candidates','coach_supervised_request_resolutions']) {
      expect(await f.scalar('SELECT to_regclass($1) AS value',[object])).toBeNull()
    }
    for (const signature of ['resolve_supervised_request(jsonb)','get_supervised_request_resolution(jsonb)','accept_adaptation_proposal_before_supervision(uuid,text)']) {
      expect(await f.scalar('SELECT to_regprocedure($1) AS value',[signature])).toBeNull()
    }
    await f.db.exec(fixturePlan())
  })
})
