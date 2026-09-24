import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { recommendationFixture } from '../../test/database/recommendation-fixture'
import { sqlFile } from '../../test/database/fixture'
import { buildProgrammingProfile, validateCompleteCoachPlanningInput } from '../../app/lib/coach/complete-intake'
import { buildRollingTrainingDirection } from '../../app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan } from '../../app/lib/coach/rolling-weekly-plan'
import { buildAdaptivePlanContract } from '../../app/lib/coach/adaptive-plan'
import { buildStoredRollingWeeklyIntent, profileForDirectionHorizon, rollingFingerprint, serializeRollingSessions } from '../../app/lib/coach/rolling-weekly-api'
import { CUTOVER_SMOKE_DIGEST_SQL, CUTOVER_SMOKE_STATE_SQL, CUTOVER_SMOKE_READ_SETTINGS, CUTOVER_ACCEPTED_PLAN_IDS_SQL,
  CUTOVER_ACCEPTED_PLAN_DIGEST_SQL, cutoverAcceptedPlanDigestsMatch, cutoverSmokeContract } from './cutover-smoke-contract.mjs'
import { readFileSync } from 'node:fs'

const contract = cutoverSmokeContract('11111111-1111-4111-8111-111111111111')
const owner = '22222222-2222-4222-8222-222222222222'
const validated = validateCompleteCoachPlanningInput(contract.create.body.planningInput)
if (!validated.ok) throw Error('Synthetic intake invalid')
const profile = profileForDirectionHorizon(buildProgrammingProfile(validated.value, []), validated.value.startDate, contract.create.body.goalTargetDate)
const direction = buildRollingTrainingDirection(profile, { hypothesis: 'Repeatable weekly strength doses will support the athlete goal.', goalTargetDate: contract.create.body.goalTargetDate })
const plan = buildRollingWeeklyPlan({ source: 'initial', windowStart: profile.startDate, profile, direction })
if (plan.kind !== 'weekly_plan') throw Error('Synthetic plan did not compile')
const intent = buildStoredRollingWeeklyIntent(plan, buildAdaptivePlanContract(profile, [plan]))
const snapshot = { contextRevision: 0, reason: 'initial_rolling_weekly_proposal', planningInput: validated.value, goalTargetDate: contract.create.body.goalTargetDate, direction, assessments: [] }
const fingerprint = rollingFingerprint({ intent, sourceSnapshot: snapshot })
const args = [plan.title, profile.athleteGoalSummary, plan.windowStart, contract.create.body.goalTargetDate, direction, plan.evidenceReferenceVersion,
  plan.policyVersion, intent, snapshot, serializeRollingSessions(plan), { reason: 'initial_rolling_weekly_proposal', input_fingerprint: fingerprint,
    automaticPlanActivation: false, athleteReviewRequired: true }, fingerprint, contract.create.body.idempotencyKey]
let db: PGlite
beforeAll(async () => {
  db = await recommendationFixture()
  await db.exec(sqlFile('supabase/migrations/20260923010000_coaching_write_pause.sql'))
  await db.exec(sqlFile('supabase/migrations/20260921010000_coach_proposal_context_revision.sql'))
  // SQL-only Auth fixture is not the proposed production Auth Admin procedure.
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [owner])
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner])
}, 30_000)
afterAll(async () => { await db?.close() })
async function actor() { await db.exec('SET ROLE authenticated') }
async function gate(paused: boolean) {
  await db.exec('RESET ROLE')
  const generation = (await db.query<{ generation: number }>('SELECT generation FROM coaching_write_control')).rows[0].generation
  await db.transaction(tx => tx.query('SELECT * FROM set_coaching_write_pause($1,$2,$3)', [paused, generation, 'Synthetic smoke fixture']))
  expect((await db.query('SELECT paused,generation FROM coaching_write_control')).rows[0]).toEqual({ paused, generation: generation + 1 })
}
const digest = async () => db.transaction(async tx => { await tx.exec(CUTOVER_SMOKE_READ_SETTINGS); return (await tx.query(CUTOVER_SMOKE_DIGEST_SQL, [owner])).rows })
const counts = async () => Object.fromEntries((await digest()).map((row: any) => [row.relation, row.count]))
const create = () => db.transaction(async tx => (await tx.query<Record<string, string>>(`SELECT * FROM create_initial_rolling_weekly_proposal(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args)).rows[0])

describe('frozen cutover smoke preparation', () => {
  it('freezes one run key, exact dates, compiler session rows and no evidence-derived loading', () => {
    expect(contract.acceptanceBody.idempotencyKey).toBe(contract.create.body.idempotencyKey)
    expect(() => cutoverSmokeContract('arbitrary-email-or-target')).toThrow()
    expect(plan.windowEnd).toBe('2026-10-04')
    expect(serializeRollingSessions(plan).map(s => s.scheduled_date)).toEqual(contract.expected.sessionDates)
    expect(serializeRollingSessions(plan)).toHaveLength(3)
    expect(profile.assessments).toEqual([])
    expect(fingerprint).toBe('78029d250d42d4a520d59a19cb26e78afb1f3f5698df8f7fbd30e513b2d3a2ab')
    const frozen = JSON.parse(readFileSync('docs/verification/programming-quality/production-cutover-smoke-input-2026-09-23.json', 'utf8'))
    expect(frozen).toEqual(cutoverSmokeContract(frozen.runId))
  })

  it('executes paused rejection, resume/create/accept, re-pause and exact immutable same-key replay', async () => {
    await gate(true)
    await actor()
    expect((await db.query('SELECT get_coach_context_revision() AS revision')).rows[0]).toEqual({ revision: 0 })
    const before = await digest()
    await expect(create()).rejects.toMatchObject({ code: 'PT503' })
    expect(await digest()).toEqual(before)
    expect(await counts()).toEqual(contract.expected.afterPausedCreate)
    await gate(false)
    await actor()
    const proposal = await create()
    const accept = () => db.transaction(async tx => (await tx.query('SELECT * FROM accept_adaptation_proposal($1,$2)', [proposal.proposal_id, contract.acceptanceBody.idempotencyKey])).rows[0])
    const accepted = await accept()
    expect(accepted).toEqual({ accepted_program_id: proposal.proposed_program_id, active_plan_version_id: proposal.proposed_plan_version_id, proposal_status: 'accepted' })
    const afterAccepted = await digest()
    expect(await counts()).toEqual(contract.expected.afterAccepted)
    const state = (await db.query(CUTOVER_SMOKE_STATE_SQL, [owner])).rows[0]
    expect(state).toMatchObject({ program_status: 'active', plan_status: 'accepted', proposal_status: 'accepted', sessions: 3, current_context_revision: 0, proposal_context_revision: 0, input_fingerprint: fingerprint })
    await gate(true)
    await actor()
    expect(await accept()).toEqual(accepted)
    expect(await digest()).toEqual(afterAccepted)
    await db.exec('RESET ROLE')
    expect((await db.query('SELECT paused FROM coaching_write_control')).rows[0]).toEqual({ paused: true })
  })

  it('hashes fixed immutable plan fields, allows status-only supersession and detects content drift or missing IDs', async () => {
    await db.exec('RESET ROLE')
    const ids = (await db.query<{ id: string }>(CUTOVER_ACCEPTED_PLAN_IDS_SQL)).rows.map(row => row.id)
    expect(ids).toHaveLength(1)
    const baseline = await db.transaction(async tx => { await tx.exec(CUTOVER_SMOKE_READ_SETTINGS); return (await tx.query(CUTOVER_ACCEPTED_PLAN_DIGEST_SQL, [ids])).rows })
    await expect(db.transaction(async tx => {
      await tx.exec(CUTOVER_SMOKE_READ_SETTINGS)
      // Privileged local negative-control fixture ONLY. Never part of operator SQL.
      await tx.exec("SET LOCAL session_replication_role='replica'")
      await tx.query("UPDATE public.training_plan_versions SET status='superseded' WHERE id=$1", [ids[0]])
      expect(cutoverAcceptedPlanDigestsMatch(baseline, (await tx.query(CUTOVER_ACCEPTED_PLAN_DIGEST_SQL, [ids])).rows)).toBe(true)
      await tx.query("UPDATE public.training_plan_versions SET intent=intent || '{\"synthetic_corruption\":true}'::jsonb WHERE id=$1", [ids[0]])
      expect(cutoverAcceptedPlanDigestsMatch(baseline, (await tx.query(CUTOVER_ACCEPTED_PLAN_DIGEST_SQL, [ids])).rows)).toBe(false)
      await tx.query('DELETE FROM public.training_plan_versions WHERE id=$1', [ids[0]])
      const missing = (await tx.query(CUTOVER_ACCEPTED_PLAN_DIGEST_SQL, [ids])).rows
      expect(missing).toEqual([{ id: ids[0], present: false, sha256: null }])
      expect(cutoverAcceptedPlanDigestsMatch(baseline, missing)).toBe(false)
      throw Error('rollback synthetic negative controls')
    })).rejects.toThrow('rollback synthetic negative controls')
    const restored = await db.transaction(async tx => { await tx.exec(CUTOVER_SMOKE_READ_SETTINGS); return (await tx.query(CUTOVER_ACCEPTED_PLAN_DIGEST_SQL, [ids])).rows })
    expect(cutoverAcceptedPlanDigestsMatch(baseline, restored)).toBe(true)
  })
})
