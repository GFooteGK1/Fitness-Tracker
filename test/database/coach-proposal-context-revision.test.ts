import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { databaseFixture, sqlFile } from './fixture'
import { intent } from '../fixtures/personalized-coaching/intent'
import { captureSetupMemoryBindings } from '../../app/lib/coach/setup-memory-bindings'
import { GOLDEN_PROGRAMMING_PROFILES } from '../coach/golden-programming-profiles'
import { reconcileTrainingDirection } from '../../app/lib/coach/direction-reconciliation'
import { buildRollingWeeklyPlan } from '../../app/lib/coach/rolling-weekly-plan'
import { buildRollingTrainingDirection } from '../../app/lib/coach/rolling-weekly-contracts'

// Executes actual PostgreSQL functions/triggers. PGlite serializes statements;
// these tests cover ordered races and rollback, not multi-session lock contention.
let db: PGlite
let legacy: { owner: string; proposal: Record<string, string>; key: string }
let unbound: typeof legacy
let acceptedLegacy: typeof legacy
let legacyReview: { review_id: string }
let legacyReviewProposal: Record<string, any>
let conversion: typeof legacy
let oldConversion: Record<string, any>
const emptySetup = () => ({ schemaVersion: 1, memories: { primary_goal: null, training_schedule: null, available_equipment: null, training_constraints: null } })
const setupMigrationPath = 'supabase/migrations/20260926010000_coach_setup_memory_bindings.sql'
const migrationPath = 'supabase/migrations/20260921010000_coach_proposal_context_revision.sql'
const provenance = { schemaVersion: 1, occurrence: { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [] },
  fields: { quantities: { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [] } } }
const work = { workout_date: '2026-09-10', input_text: 'Reported squat', blocks: [{ block_type: 'STRENGTH', movements: [{ name: 'Squat', reps: 5, weight: '80 lb' }] }] }
const planIntent = { horizon_weeks: 1, primary_domain: 'strength', weeks: [{ week_number: 1 }], fixture: 'immutable synthetic intent' }
const sessions = (day = '2026-09-07') => [{ week_number: 1, session_index: 1, scheduled_date: day,
  prescription: { domain: 'strength', intent: 'Repeat controlled work', dose: {}, effort: 'Controlled', rest: 'As needed',
    success_condition: 'Quality', stop_condition: 'Stop on pain', scale_options: [], evidence: {} } }]
async function actor(owner: string | null, role = 'authenticated') {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner ?? ''])
  await db.exec(`SET ROLE ${role}`)
}
async function call(fn: string, args: unknown[] = []) {
  // Deferred guard failures surface at transaction completion. Explicit fixture
  // transactions ensure PGlite rolls back that failed completion before reuse.
  return db.transaction(async tx => (await tx.query<Record<string, any>>(
    `SELECT * FROM ${fn}(${args.map((_, i) => '$' + (i + 1)).join(',')})`, args)).rows[0])
}
const scalar = async (fn: string, args: unknown[] = []) => (await call(fn, args))[fn]
const revision = async () => Number(await scalar('get_coach_context_revision'))
const initialArgs = (context: Record<string, unknown>, key: string) => [
  'Synthetic weekly proposal', 'Build useful strength', '2026-09-07', '2027-04-01', {}, 'fixture-reference', 'fixture-policy',
  planIntent, { setupMemoryBindings: emptySetup(), ...context }, sessions(), {}, 'a'.repeat(64), key,
]
async function owner() {
  const id = randomUUID()
  await db.exec('RESET ROLE')
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [id])
  await actor(id)
  return id
}
async function initial(observedRevision?: number): Promise<Record<string, any> & { key: string; args: unknown[] }> {
  const contextRevision = observedRevision ?? await revision()
  const key = randomUUID(), args = initialArgs({ contextRevision }, key)
  return { ...(await call('create_initial_rolling_weekly_proposal', args)), key, args }
}
async function logWorkout() {
  const request = await scalar('begin_logging_request', [randomUUID(), 'b'.repeat(64)])
  const items = await scalar('freeze_logging_request_items', [request.id, [{ sourceItemId: 'source', kind: 'workout',
    record: work, blocks: [{}], provenance, inputMethod: 'text', eventAt: work.workout_date }]])
  return scalar('commit_logging_request_item', [items[0].id])
}
const accept = (proposal: Record<string, any>) => call('accept_adaptation_proposal', [proposal.proposal_id, proposal.key])
const reviewArgs = (proposal: Record<string, any>, observed: number) => [proposal.proposed_program_id, proposal.proposed_plan_version_id,
  '2026-09-07', 'athlete_requested', 'continue', 'same_track', 'sufficient', 0.8, {}, {}, {}, [], null,
  { executionSources: [], observationSources: [], contextRevision: observed, setupMemoryBindings: emptySetup() }, [], 'rolling-weekly-0.1.0', 'weekly-review-0.3.0', 'c'.repeat(64), randomUUID()]
const replacementArgs = (proposal: Record<string, any>, reviewId: string, observed: number) => [proposal.proposed_program_id, proposal.proposed_plan_version_id, reviewId,
  'Next weekly plan', 'Strength', '2026-09-14', '2027-04-01', {}, 'fixture-reference', 'fixture-policy', planIntent,
  { contextRevision: observed, setupMemoryBindings: emptySetup() }, sessions('2026-09-14'), {}, 'd'.repeat(64), randomUUID()]
async function counts() {
  return (await db.query('SELECT (SELECT count(*) FROM training_programs) programs,(SELECT count(*) FROM training_plan_versions) plans,(SELECT count(*) FROM prescribed_sessions) sessions,(SELECT count(*) FROM adaptation_proposals) proposals')).rows[0]
}
const setupProfile = { ...GOLDEN_PROGRAMMING_PROFILES[0].profile, startDate: '2026-09-07' }
const setupContent = {
  primary_goal: { goal: setupProfile.primaryGoal.athleteIntent, primaryDomain: setupProfile.primaryGoal.domain, secondaryGoals: [] },
  training_schedule: { experience: setupProfile.trainingExperience, trainingDays: setupProfile.sessionAvailability.map(slot => slot.day), sessionMinutes: setupProfile.sessionAvailability[0].minutes },
  available_equipment: { equipment: setupProfile.equipment.unresolvedAthleteDescription ?? '', resolvedEquipmentIds: setupProfile.equipment.resolvedIds },
  training_constraints: { constraints: '', constraintKinds: [] },
}
// Actual resolver reads actual owned PostgreSQL rows; no lifecycle or identity mocks.
function setupClient() {
  return { from: () => {
    const filters: Record<string, unknown> = {}
    const chain = { select: () => chain, eq: (key: string, value: unknown) => { filters[key] = value; return chain }, order: () => chain,
      limit: async () => ({ data: JSON.parse(JSON.stringify((await db.query('SELECT * FROM coach_memories WHERE user_id=$1 AND memory_key=$2 ORDER BY version DESC LIMIT 1', [filters.user_id, filters.memory_key])).rows)), error: null }) }
    return chain
  } }
}
async function confirmSetup(key: keyof typeof setupContent) {
  const kind = { primary_goal: 'goal', training_schedule: 'schedule', available_equipment: 'equipment', training_constraints: 'constraint' }[key]
  return call('confirm_coach_memory', [key, kind, setupContent[key], { source: 'program_setup', confirmedBy: 'athlete' }, 1, randomUUID()])
}

beforeAll(async () => {
  db = await databaseFixture()
  for (const file of ['coach-system-migration.sql', 'coach-plan-replacement-migration.sql', 'coach-complete-programming-v0-3-migration.sql',
    'coach-execution-feedback-migration.sql', 'layered-adaptive-evidence-migration.sql', 'atomic-coach-session-completion-migration.sql',
    'qwik-vbt-import-migration.sql', 'coach-trust-review-migration.sql', 'rolling-weekly-coach-migration.sql']) await db.exec(sqlFile(`docs/migrations/${file}`))
  for (const file of ['20260728143952_nutrition_fast_logging.sql', '20260730130953_coach_workout_runner_v0_5.sql',
    '20260904023000_fix_atomic_session_workout_link.sql', '20260904120000_logging_receipts.sql',
    '20260915220000_exercise_preferences.sql',
    '20260918010000_optional_session_feedback.sql', '20260918011000_session_capture_signals.sql']) await db.exec(sqlFile(`supabase/migrations/${file}`))
  await db.exec(sqlFile('docs/migrations/personal-records-migration.sql'))
  await db.exec(sqlFile('supabase/migrations/20260728134202_personal_record_idempotency.sql'))
  for (const file of ['20260918020000_capture_receipts.sql', '20260918030000_training_intent.sql', '20260918040000_targeted_review_sources.sql']) await db.exec(sqlFile(`supabase/migrations/${file}`))
  const legacyOwner = await owner(), key = randomUUID()
  legacy = { owner: legacyOwner, key, proposal: await call('create_initial_rolling_weekly_proposal', initialArgs({}, key)) }
  await db.exec('RESET ROLE')
  await db.exec(sqlFile(migrationPath))
  await db.exec(sqlFile(migrationPath))
  for (const accepted of [false, true]) {
    const uid = await owner(), key = randomUUID(), args = initialArgs({ contextRevision: await revision() }, key)
    args[8] = { contextRevision: await revision() } // A real pre-upgrade, revision-stamped but unbound draft.
    const fixture = { owner: uid, key, proposal: await call('create_initial_rolling_weekly_proposal', args) }
    if (accepted) { await accept({ ...fixture.proposal, key }); acceptedLegacy = fixture } else unbound = fixture
  }
  await actor(acceptedLegacy.owner)
  const oldReviewArgs = reviewArgs(acceptedLegacy.proposal, await revision())
  oldReviewArgs[13] = { executionSources: [], observationSources: [], contextRevision: await revision() }
  legacyReview = await call('record_coach_weekly_review', oldReviewArgs) as { review_id: string }
  const oldProposalArgs = replacementArgs(acceptedLegacy.proposal, legacyReview.review_id, await revision())
  oldProposalArgs[11] = { contextRevision: await revision() }
  legacyReviewProposal = await call('create_rolling_weekly_replacement_proposal', oldProposalArgs)
  const conversionOwner = await owner(), conversionKey = randomUUID()
  const eightWeekSessions = Array.from({ length: 16 }, (_, index) => ({ ...sessions()[0], week_number: Math.floor(index / 2) + 1, session_index: index % 2 + 1 }))
  conversion = { owner: conversionOwner, key: conversionKey, proposal: await call('create_initial_training_plan_proposal', [
    'Legacy fixture', 'Strength', '2026-09-07', 'reference', 'policy', { ...planIntent, horizon_weeks: 8 }, {}, eightWeekSessions, {}, 'e'.repeat(64), conversionKey,
  ]) }
  await accept({ ...conversion.proposal, key: conversionKey })
  const conversionArgs = replacementArgs(conversion.proposal, null as never, await revision())
  conversionArgs[11] = { contextRevision: await revision() }
  oldConversion = await call('create_rolling_weekly_replacement_proposal', conversionArgs)
  await db.exec('RESET ROLE')
  await db.exec(sqlFile(setupMigrationPath))
  await db.exec(sqlFile(setupMigrationPath))
}, 30_000)
afterAll(async () => { await db?.close() })

describe('rolling proposal context revision transactions', () => {
  it('refreshes a legacy unbound review and pending window without an unrelated source write', async () => {
    await actor(acceptedLegacy.owner)
    const observed = await revision()
    const fresh = await call('record_coach_weekly_review', reviewArgs(acceptedLegacy.proposal, observed))
    expect(fresh.review_id).not.toBe(legacyReview.review_id)
    expect(await revision()).toBe(observed)
    expect((await db.query<{ status: string }>('SELECT status FROM adaptation_proposals WHERE id=$1', [legacyReviewProposal.proposal_id])).rows[0].status).toBe('expired')
    expect((await call('create_rolling_weekly_replacement_proposal', replacementArgs(acceptedLegacy.proposal, fresh.review_id, observed))).proposal_id).toBeTruthy()
  })
  it('recreates an unbound legacy conversion in the same window without a review or unrelated source write', async () => {
    await actor(conversion.owner)
    const observed = await revision()
    const fresh = await call('create_rolling_weekly_replacement_proposal', replacementArgs(conversion.proposal, null as never, observed))
    expect(fresh.proposal_id).not.toBe(oldConversion.proposal_id)
    expect(await revision()).toBe(observed)
    expect((await db.query<{ status: string }>('SELECT status FROM adaptation_proposals WHERE id=$1', [oldConversion.proposal_id])).rows[0].status).toBe('expired')
  })
  it('requires recreation of unbound pending drafts but preserves already accepted replay across the upgrade', async () => {
    await actor(unbound.owner)
    await expect(accept({ ...unbound.proposal, key: unbound.key })).rejects.toMatchObject({ code: '40001' })
    expect((await db.query<{ input_snapshot: unknown }>('SELECT input_snapshot FROM training_plan_versions WHERE id=$1', [unbound.proposal.proposed_plan_version_id])).rows[0].input_snapshot).toEqual({ contextRevision: 0 })
    const fresh = await initial()
    expect((await accept(fresh)).proposal_status).toBe('accepted')
    await actor(acceptedLegacy.owner)
    expect((await accept({ ...acceptedLegacy.proposal, key: acceptedLegacy.key })).proposal_status).toBe('accepted')
  })

  it.each(['primary_goal', 'training_schedule', 'available_equipment', 'training_constraints'] as const)
    ('rejects elapsed %s authority with unchanged revision', async key => {
      const uid = await owner(), saved = await confirmSetup(key)
      await db.exec('RESET ROLE')
      await db.query("UPDATE coach_memories SET effective_until=clock_timestamp()+INTERVAL '1 second', review_after=clock_timestamp()+INTERVAL '1 second' WHERE id=$1", [saved.memory_id])
      await actor(uid)
      const observed = await revision(), bindings = await captureSetupMemoryBindings(setupClient() as never, uid, setupProfile)
      const proposal = async (): Promise<Record<string, any>> => { const key = randomUUID(); return { ...(await call('create_initial_rolling_weekly_proposal', initialArgs({ contextRevision: observed, setupMemoryBindings: bindings }, key))), key } }
      const pending = await proposal()
      await new Promise(resolve => setTimeout(resolve, 1_100))
      expect(await revision()).toBe(observed)
      await expect(accept(pending)).rejects.toMatchObject({ code: '40001' })
      expect((await db.query<{ status: string }>('SELECT status FROM adaptation_proposals WHERE id=$1', [pending.proposal_id])).rows[0].status).toBe('proposed')
    })

  it('carries an actually reconciled schedule from review to proposal and rejects expiry before acceptance', async () => {
    const uid = await owner()
    const active = await initial(); await accept(active)
    const saved = await confirmSetup('training_schedule')
    await db.exec('RESET ROLE')
    await db.query("UPDATE coach_memories SET review_after=clock_timestamp()+INTERVAL '1 second' WHERE id=$1", [saved.memory_id])
    await actor(uid)
    const row = JSON.parse(JSON.stringify((await db.query<any>('SELECT * FROM coach_memories WHERE id=$1', [saved.memory_id])).rows[0]))
    const week = buildRollingWeeklyPlan({ source: 'initial', windowStart: setupProfile.startDate, profile: setupProfile,
      direction: buildRollingTrainingDirection(setupProfile, { hypothesis: 'Repeat controlled exposures to assess progress.', goalTargetDate: null }) })
    if (week.kind !== 'weekly_plan') throw Error('Expected weekly fixture')
    expect(reconcileTrainingDirection({ userId: uid, acceptedWeek: week, nextWindowStart: '2026-09-14', memories: { training_schedule: row }, intentRequired: false, asOf: new Date().toISOString() }).status).toBe('unchanged')
    const observed = await revision(), setupMemoryBindings = await captureSetupMemoryBindings(setupClient() as never, uid, setupProfile, { review: true })
    const rargs = reviewArgs(active, observed); rargs[13] = { ...(rargs[13] as object), setupMemoryBindings }
    const review = await call('record_coach_weekly_review', rargs)
    const pargs = replacementArgs(active, review.review_id, observed); pargs[11] = { contextRevision: observed, setupMemoryBindings }
    const pending: Record<string, any> = { ...(await call('create_rolling_weekly_replacement_proposal', pargs)), key: pargs[15] }
    await new Promise(resolve => setTimeout(resolve, 1_100))
    expect(await revision()).toBe(observed)
    await expect(accept(pending)).rejects.toMatchObject({ code: '40001' })
    const freshBindings = await captureSetupMemoryBindings(setupClient() as never, uid, setupProfile, { review: true })
    const successorArgs = reviewArgs(active, observed); successorArgs[13] = { ...(successorArgs[13] as object), setupMemoryBindings: freshBindings }
    const successor = await call('record_coach_weekly_review', successorArgs)
    expect(successor.review_id).not.toBe(review.review_id)
    expect(await revision()).toBe(observed)
    expect((await db.query<{ status: string }>('SELECT status FROM adaptation_proposals WHERE id=$1', [pending.proposal_id])).rows[0].status).toBe('expired')
  })

  it('checks canonical preference expiry while retaining accepted response-loss replay', async () => {
    for (const acceptBeforeExpiry of [false, true]) {
      const uid = await owner(), content = { schemaVersion: 1 as const, state: 'none' as const, entries: [] }
      const saved = await call('confirm_coach_memory', ['exercise_preferences', 'preference', content, { source: 'program_setup', confirmedBy: 'athlete' }, 1, randomUUID()])
      await db.exec('RESET ROLE')
      await db.query("UPDATE coach_memories SET effective_until=clock_timestamp()+INTERVAL '1 second' WHERE id=$1", [saved.memory_id])
      await actor(uid)
      const observed = await revision(), profile = { ...setupProfile, exercisePreferences: content }
      const setupMemoryBindings = await captureSetupMemoryBindings(setupClient() as never, uid, profile)
      const key = randomUUID(), pending: Record<string, any> = { ...(await call('create_initial_rolling_weekly_proposal', initialArgs({ contextRevision: observed, setupMemoryBindings }, key))), key }
      const accepted = acceptBeforeExpiry ? await accept(pending) : null
      await new Promise(resolve => setTimeout(resolve, 1_100))
      expect(await revision()).toBe(observed)
      if (accepted) expect(await accept(pending)).toEqual(accepted)
      else await expect(accept(pending)).rejects.toMatchObject({ code: '40001' })
    }
  })

  it('does not relabel a known future-dated source as empty when it becomes active', async () => {
    const uid = await owner(), saved = await confirmSetup('training_schedule')
    await db.exec('RESET ROLE')
    await db.query("UPDATE coach_memories SET effective_from=clock_timestamp()+INTERVAL '1 second' WHERE id=$1", [saved.memory_id])
    await actor(uid)
    const observed = await revision(), setupMemoryBindings = await captureSetupMemoryBindings(setupClient() as never, uid, setupProfile, { review: true })
    const key = randomUUID(), args = initialArgs({ contextRevision: observed, setupMemoryBindings }, key)
    await expect(call('create_initial_rolling_weekly_proposal', args)).rejects.toMatchObject({ code: '40001' })
    await expect(initial(observed)).rejects.toMatchObject({ code: '40001' }) // Forged empty read is rejected too.
    await new Promise(resolve => setTimeout(resolve, 1_100))
    expect(await revision()).toBe(observed)
    await expect(call('create_initial_rolling_weekly_proposal', args)).rejects.toMatchObject({ code: '40001' })
    args[8] = { contextRevision: observed, setupMemoryBindings: await captureSetupMemoryBindings(setupClient() as never, uid, setupProfile) }
    const pending: Record<string, any> = { ...(await call('create_initial_rolling_weekly_proposal', args)), key }
    expect((await accept(pending)).proposal_status).toBe('accepted')
  })

  it('rejects foreign setup identities and binding replacement on a stored review', async () => {
    const foreign = await owner(); await confirmSetup('training_schedule')
    const bindings = await captureSetupMemoryBindings(setupClient() as never, foreign, setupProfile)
    await owner()
    const observed = await revision()
    await expect(call('create_initial_rolling_weekly_proposal', initialArgs({ contextRevision: observed, setupMemoryBindings: bindings }, randomUUID()))).rejects.toMatchObject({ code: '40001' })
    const active = await initial(); await accept(active)
    const review = await call('record_coach_weekly_review', reviewArgs(active, observed))
    const args = replacementArgs(active, review.review_id, observed)
    args[11] = { contextRevision: observed, setupMemoryBindings: { ...emptySetup(), memories: { ...emptySetup().memories, exercise_preferences: null } } }
    await expect(call('create_rolling_weekly_replacement_proposal', args)).rejects.toMatchObject({ code: '40001' })
  })
  it('caps each decision RPC lock wait without changing the caller timeout', async () => {
    const rows = (await db.query<{ proname: string; proconfig: string[] }>(`SELECT proname,proconfig FROM pg_proc
      WHERE pronamespace='public'::regnamespace AND proname IN ('get_coach_context_revision','create_initial_rolling_weekly_proposal',
      'record_coach_weekly_review','create_rolling_weekly_replacement_proposal','accept_adaptation_proposal')`)).rows
    expect(rows).toHaveLength(5)
    for (const row of rows) expect(row.proconfig, row.proname).toContain('lock_timeout=1s')
    await owner()
    await db.exec("SET lock_timeout='7s'")
    await revision()
    expect((await db.query<{ value: string }>("SELECT current_setting('lock_timeout') value")).rows[0].value).toBe('7s')
    await db.exec('RESET lock_timeout')
  })
  it('rejects a forged zero stamp when the athlete never read an initialized context revision', async () => {
    await owner()
    const before = await counts()
    await expect(call('create_initial_rolling_weekly_proposal', initialArgs({ contextRevision: 0 }, randomUUID())))
      .rejects.toMatchObject({ code: '40001' })
    expect(await counts()).toEqual(before)
    expect((await db.query('SELECT user_id FROM coach_context_revisions')).rows).toEqual([])
  })

  it('rolls back every initial proposal write when context changed after the source read', async () => {
    await owner()
    const observed = await revision()
    await logWorkout()
    expect(await revision()).toBeGreaterThan(observed)
    const before = await counts()
    await expect(initial(observed)).rejects.toMatchObject({ code: '40001' })
    expect(await counts()).toEqual(before)
  })

  it('allows unchanged create and accept replay without mutating intent or creating a second plan', async () => {
    await owner()
    const p = await initial()
    expect(await call('create_initial_rolling_weekly_proposal', p.args)).toMatchObject({ proposal_id: p.proposal_id })
    const accepted = await accept(p), before = await counts()
    expect(await accept(p)).toEqual(accepted)
    expect(await counts()).toEqual(before)
    const stored = (await db.query<{ intent: unknown; status: string }>('SELECT intent,status FROM training_plan_versions WHERE id=$1', [p.proposed_plan_version_id])).rows[0]
    expect(stored).toEqual({ intent: planIntent, status: 'accepted' })
    await logWorkout()
    expect(await accept(p)).toEqual(accepted)
    expect((await db.query<{ intent: unknown }>('SELECT intent FROM training_plan_versions WHERE id=$1', [p.proposed_plan_version_id])).rows[0].intent).toEqual(planIntent)
  })

  it('recovers from a stale initial draft by creating and accepting a fresh draft', async () => {
    await owner()
    const old = await initial()
    await logWorkout()
    const fresh = await initial()
    expect(fresh.proposed_program_id).not.toBe(old.proposed_program_id)
    expect((await accept(fresh)).proposal_status).toBe('accepted')
    expect((await db.query<{ status: string; intent: unknown }>('SELECT status,intent FROM training_plan_versions WHERE id=$1', [old.proposed_plan_version_id])).rows[0])
      .toEqual({ status: 'proposed', intent: planIntent })
    await expect(accept(old)).rejects.toMatchObject({ code: '40001' })
  })

  it.each(['insert', 'correct', 'delete'])('rejects pending acceptance after actual history %s', async kind => {
    await owner()
    const receipt = kind === 'insert' ? null : await logWorkout()
    const p = await initial(), before = await counts()
    if (kind === 'insert') await logWorkout()
    else if (kind === 'correct') await scalar('amend_logged_activity', ['workout', receipt.entityId, 1, randomUUID(),
      { ...work, input_text: 'Corrected actual repetitions' }, [{}], provenance])
    else await scalar('delete_logged_activity', ['workout', receipt.entityId, 1, randomUUID()])
    await expect(accept(p)).rejects.toMatchObject({ code: '40001' })
    expect(await counts()).toEqual(before)
    expect((await db.query<{ status: string }>('SELECT status FROM training_plan_versions WHERE id=$1', [p.proposed_plan_version_id])).rows[0].status).toBe('proposed')
  })

  it.each(['superseded', 'withdrawn'])('rejects a draft after confirmed intent is %s', async change => {
    await owner()
    const first = await call('confirm_training_intent', [intent(), randomUUID(), null])
    const p = await initial()
    if (change === 'superseded') {
      const next = intent(); next.outcomes[0].goal.statement = 'Improve the confirmed running outcome next April'
      await call('confirm_training_intent', [next, randomUUID(), first.memory_id])
    } else await call('review_coach_memory', [first.memory_id, 'withdrawn', 'Athlete withdrew this intent', randomUUID()])
    await expect(accept(p)).rejects.toMatchObject({ code: '40001' })
    expect((await db.query<{ status: string }>('SELECT status FROM adaptation_proposals WHERE id=$1', [p.proposal_id])).rows[0].status).toBe('proposed')
  })

  it('does not allow a newly stamped proposal to launder a stored review from an older context revision', async () => {
    await owner()
    const p = await initial(); await accept(p)
    const observed = await revision()
    const review = await call('record_coach_weekly_review', reviewArgs(p, observed))
    await logWorkout()
    const fresh = await revision(), before = await counts()
    await expect(call('create_rolling_weekly_replacement_proposal', replacementArgs(p, review.review_id, fresh))).rejects.toMatchObject({ code: '40001' })
    expect(await counts()).toEqual(before)
  })

  it('creates a successor and regenerates the pending window without rewriting accepted history', async () => {
    await owner()
    const p = await initial(); await accept(p)
    const oldRevision = await revision(), oldArgs = reviewArgs(p, oldRevision)
    const oldReview = await call('record_coach_weekly_review', oldArgs)
    const oldProposal = await call('create_rolling_weekly_replacement_proposal', replacementArgs(p, oldReview.review_id, oldRevision))
    await logWorkout()
    const fresh = await revision(), nextReview = await call('record_coach_weekly_review', reviewArgs(p, fresh))
    expect((await db.query<{ supersedes_review_id: string; review_revision: number }>('SELECT supersedes_review_id,review_revision FROM coach_weekly_reviews WHERE id=$1', [nextReview.review_id])).rows[0])
      .toEqual({ supersedes_review_id: oldReview.review_id, review_revision: 2 })
    expect((await db.query<{ status: string }>('SELECT status FROM adaptation_proposals WHERE id=$1', [oldProposal.proposal_id])).rows[0].status).toBe('expired')
    const nextProposal = await call('create_rolling_weekly_replacement_proposal', replacementArgs(p, nextReview.review_id, fresh))
    expect(nextProposal.proposal_id).not.toBe(oldProposal.proposal_id)
    expect(await call('record_coach_weekly_review', oldArgs)).toMatchObject({ review_id: oldReview.review_id })
    expect((await db.query<{ status: string; intent: unknown }>('SELECT status,intent FROM training_plan_versions WHERE id=$1', [p.proposed_plan_version_id])).rows[0])
      .toEqual({ status: 'accepted', intent: planIntent })
  })

  it('rejects time-expired intent at acceptance even when the source revision has not changed', async () => {
    const uid = await owner()
    const confirmed = await call('confirm_training_intent', [intent(), randomUUID(), null])
    await db.exec('RESET ROLE')
    await db.query("UPDATE coach_memories SET effective_until=clock_timestamp()+INTERVAL '1 second' WHERE id=$1", [confirmed.memory_id])
    const memory = (await db.query<{ content: unknown }>('SELECT content FROM coach_memories WHERE id=$1', [confirmed.memory_id])).rows[0]
    await actor(uid)
    const observed = await revision(), key = randomUUID(), args = initialArgs({ contextRevision: observed }, key)
    args[7] = { ...planIntent, training_intent: { schemaVersion: 1, memoryId: confirmed.memory_id, memoryVersion: confirmed.memory_version, content: memory.content } }
    const p = { ...(await call('create_initial_rolling_weekly_proposal', args)), key }
    await new Promise(resolve => setTimeout(resolve, 1_100))
    expect(await revision()).toBe(observed)
    await expect(accept(p)).rejects.toMatchObject({ code: '40001' })
  })

  it('rejects acceptance of a legacy unstamped rolling draft without rewriting it', async () => {
    await actor(legacy.owner)
    const before = await counts()
    await expect(accept({ ...legacy.proposal, key: legacy.key })).rejects.toMatchObject({ code: '40001' })
    expect(await counts()).toEqual(before)
    expect((await db.query<{ input_snapshot: unknown }>('SELECT input_snapshot FROM training_plan_versions WHERE id=$1', [legacy.proposal.proposed_plan_version_id])).rows[0].input_snapshot).toEqual({ setupMemoryBindings: emptySetup() })
  })

  it('isolates context changes by athlete and denies direct epoch writes', async () => {
    const first = await owner(), before = await revision(), p = await initial(before)
    const second = await owner(); await logWorkout()
    await expect(accept(p)).rejects.toMatchObject({ code: 'P0002' })
    await actor(first)
    expect(await revision()).toBe(before)
    expect((await db.query('SELECT user_id FROM coach_context_revisions WHERE user_id=$1', [second])).rows).toEqual([])
    expect((await accept(p)).proposal_status).toBe('accepted')
    for (const role of ['authenticated', 'service_role', 'anon']) {
      const privileges = (await db.query<{ allowed: boolean }>("SELECT has_table_privilege($1,'coach_context_revisions','INSERT,UPDATE,DELETE') allowed", [role])).rows[0]
      expect(privileges.allowed, role).toBe(false)
    }
    await actor(null)
    await expect(revision()).rejects.toMatchObject({ code: '42501' })
  })

  it('declares database locking rather than treating sequential tests as concurrent contention evidence', () => {
    const migration = sqlFile(migrationPath)
    expect(migration).toMatch(/FOR\s+(UPDATE|SHARE)/i)
    expect(migration).toMatch(/DEFERRABLE\s+INITIALLY\s+DEFERRED/i)
    expect(migration).toContain('contextRevision')
  })
})
