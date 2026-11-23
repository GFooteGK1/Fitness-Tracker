import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { projectRequirement, type ContextRow } from '@/app/lib/coach/coaching-context'
import type { AuthorizedContextRequest } from '@/app/lib/coach/coaching-context-tool'
import { createCoachingRequirementTools } from '@/app/lib/coach/coaching-requirement-tools'
import { sqlFile } from './fixture'
import { lifecycleIds, supervisedLifecycleFixture } from './supervised-lifecycle-fixture'

const { owner, foreign } = lifecycleIds
const epoch = '1970-01-01T00:00:00.000Z'
const intent = {
  schemaVersion: 1, confirmedAt: epoch, priorityOrder: null, event: null,
  outcomes: [{
    goal: {
      schemaVersion: 1, id: 'goal:consistency', kind: 'process', statement: 'Train three days a week consistently',
      priority: 'primary', status: 'active', target: null, targetDate: null, requiredQualityIds: ['training_adherence'],
      source: { kind: 'athlete_confirmed', confirmedAt: epoch },
    },
    domain: 'resilience', measurement: null,
    binding: { movementId: null, distance: null, equipmentIds: [], variation: null },
    baseline: { status: 'unknown' }, capability: { status: 'supported' },
  }],
}
const equipment = { equipment: 'I have dumbbells and an adjustable bench', resolvedEquipmentIds: ['dumbbell', 'bench'] }
const replacementEquipment = { equipment: 'I only have dumbbells now', resolvedEquipmentIds: ['dumbbell'] }
const reviewedEquipment = { schemaVersion: 2, equipment: 'I have a flat bench', resolvedEquipmentIds: ['flat_bench'], unresolvedAthleteDescription: null }
const constraints = { constraints: 'My shoulder hurts when I press overhead. Skip overhead work.', constraintKinds: ['no_overhead'] }
const clearConstraints = { constraints: '', constraintKinds: [] }
const preferences = { schemaVersion: 1, state: 'specified', entries: [
  { athleteWording: 'I enjoy goblet squats', target: { kind: 'movement', id: 'dumbbell_goblet_squat' } },
  { athleteWording: 'I prefer to skip burpees', target: { kind: 'unresolved' } },
] }
const noPreferences = { schemaVersion: 1, state: 'none', entries: [] }

type Receipt = { id: string; version: number; userId: string; requestId: string; key: string; content: unknown; confirmedAt: string; provenance: unknown }
type Expected = { id: string; version: number; status: 'confirmed' | 'withdrawn' | 'superseded' }
const expected = (receipt: Receipt, status: Expected['status'] = 'confirmed') => ({ id: receipt.id, version: receipt.version, status })

describe('MCP coaching requirement persistence (disposable PostgreSQL with synthetic Auth claims)', () => {
  let f: Awaited<ReturnType<typeof supervisedLifecycleFixture>>

  beforeAll(async () => {
    f = await supervisedLifecycleFixture(true, true, true)
    for (const migration of ['20261005120000_first_reviewed_designation.sql', '20261005130000_first_reviewed_candidates.sql',
      '20261123130203_mcp_coaching_requirements.sql']) {
      await f.db.exec(sqlFile(`supabase/migrations/${migration}`))
    }
    const profileDdl = sqlFile('docs/migrations/complete-holistic-migration.sql').replaceAll('\r\n', '\n')
    const profileStart = profileDdl.indexOf('CREATE TABLE user_profiles (')
    await f.db.exec(profileDdl.slice(profileStart, profileDdl.indexOf('\n);', profileStart) + 3))
    await f.db.query(`INSERT INTO user_profiles (user_id, fitness_goals, medical_conditions, preferences)
      VALUES ($1, '["performance"]', '[]', '{"units":"metric"}')`, [owner])
  }, 30_000)

  beforeEach(async () => { await f.db.exec('BEGIN') })
  afterEach(async () => { await f.db.exec('ROLLBACK; RESET ROLE') })
  afterAll(async () => { await f?.db.close() })

  function save(key: string, content: unknown, prior: unknown = null, request: string | null = randomUUID()) {
    return f.scalar<Receipt>('SELECT public.save_mcp_coaching_requirement($1,$2,$3,$4) AS value',
      [request, key, prior === null ? null : JSON.stringify(prior), JSON.stringify(content)])
  }

  async function rejected(operation: () => Promise<unknown>, code: string, message?: string) {
    await f.db.exec('SAVEPOINT denied_requirement')
    try { await expect(operation()).rejects.toMatchObject({ code, ...(message ? { message } : {}) }) }
    finally { await f.db.exec('ROLLBACK TO SAVEPOINT denied_requirement; RELEASE SAVEPOINT denied_requirement') }
  }

  async function protectedState() {
    return f.scalar(`SELECT jsonb_build_object(
      'profiles', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.user_id) FROM user_profiles p),
      'programs', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM training_programs p),
      'plans', (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM training_plan_versions v),
      'sessions', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM prescribed_sessions s)
    ) AS value`)
  }

  it('writes all four canonical declarations as current owner context and preserves profile and accepted programming', async () => {
    const before = await protectedState()
    await f.actor(owner)
    const policy = { clientId: 'synthetic-client', issuer: 'https://auth.synthetic.invalid', resource: 'https://socius.synthetic.invalid/api/mcp' }
    const db = {
      auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
      rpc: async (operation: string, args: { p_memory_key: string; p_content: unknown; p_expected: unknown; p_request_id: string }) => {
        expect(operation).toBe('save_mcp_coaching_requirement')
        return { error: null, data: await save(args.p_memory_key, args.p_content, args.p_expected, args.p_request_id) }
      },
    } as unknown as AuthorizedContextRequest['db']
    const tools = createCoachingRequirementTools(async () => ({ db,
      principal: { ...policy, subject: owner, role: 'authenticated', expiresAt: Date.now() + 60_000 },
    }), policy)
    const { goal } = intent.outcomes[0]
    const goalContent = { priorityOrder: intent.priorityOrder, event: intent.event, outcomes: [{ ...intent.outcomes[0], goal: {
      id: goal.id, kind: goal.kind, statement: goal.statement, priority: goal.priority, status: goal.status,
      target: goal.target, targetDate: goal.targetDate, requiredQualityIds: goal.requiredQualityIds,
    } }] }
    for (const [key, declaration] of Object.entries({ training_intent: goalContent, available_equipment: equipment,
      training_constraints: constraints, exercise_preferences: preferences })) {
      const requestId = randomUUID()
      const { structuredContent: { saved } } = await tools.save.call({ requestId, key, expected: null, content: declaration })
      const receipt = saved as { id: string; value: unknown }
      expect(receipt).toMatchObject({ requestId, key, version: 1,
        provenance: { source: 'mcp_coaching_context', confirmedBy: 'athlete' } })
      const row = await f.scalar<ContextRow>(`SELECT to_jsonb(m) AS value FROM coach_memories m
        WHERE m.memory_key=$1 ORDER BY version DESC LIMIT 1`, [key])
      const projected = projectRequirement({ status: 'available', rows: [row], count: 1 }, key as Parameters<typeof projectRequirement>[1], new Date().toISOString())
      expect(projected).toMatchObject({ status: 'current', value: receipt.value, source: { id: receipt.id, version: 1 } })
      if (key === 'training_intent') {
        expect(receipt.value).toMatchObject({ outcomes: [{ goal: { statement: goal.statement } }] })
        expect(receipt.value).not.toMatchObject({ confirmedAt: epoch })
      } else {
        expect(receipt.value).toEqual(declaration)
      }
    }
    await f.db.exec('RESET ROLE')
    expect(await protectedState()).toEqual(before)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_mcp_requirement_receipts WHERE user_id=$1', [owner])).toBe(4)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_memories WHERE memory_key=$1', ['primary_goal'])).toBe(0)
  })

  it('binds corrections to the expected version and replays the original after later updates and pause', async () => {
    await f.actor(owner)
    const request = randomUUID(), first = await save('available_equipment', equipment, null, request)
    const second = await save('available_equipment', replacementEquipment, expected(first))
    expect(second).toMatchObject({ version: 2, content: replacementEquipment,
      provenance: { source: 'athlete_correction', correctedMemoryId: first.id } })
    await rejected(() => save('available_equipment', equipment, expected(first)), '40001')
    await rejected(() => save('available_equipment', replacementEquipment, null, request), '22023')
    await rejected(() => save('available_equipment', equipment, expected(first), request), '22023')
    await rejected(() => save('training_constraints', constraints, null, request), '22023')

    await f.db.exec('RESET ROLE')
    await f.db.exec("SELECT * FROM set_coaching_write_pause(true, 0::bigint, 'Synthetic requirement test')")
    await f.actor(owner)
    await f.db.exec("SET LOCAL TIME ZONE 'America/Chicago'")
    expect(await save('available_equipment', equipment, null, request)).toEqual(first)
    await rejected(() => save('training_constraints', constraints), 'PT503')
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_memories')).toBe(2)
  })

  it('maintains both existing equipment formats across a correction', async () => {
    await f.actor(owner)
    await rejected(() => save('available_equipment', reviewedEquipment), '22023')
    const first = await save('available_equipment', equipment)
    await rejected(() => save('available_equipment', reviewedEquipment, expected(first)), '22023')
    await f.actor(foreign)
    const initialReviewedId = await f.scalar<string>(`SELECT memory_id AS value FROM confirm_coach_memory(
      'available_equipment','equipment',$1,'{"confirmedBy":"athlete"}',1,$2)`, [JSON.stringify(reviewedEquipment), randomUUID()])
    const existing = { id: initialReviewedId, version: 1, status: 'confirmed' }
    await rejected(() => save('available_equipment', equipment, existing), '22023')
    const corrected = { ...reviewedEquipment, equipment: 'I have a flat bench and a piece of unrecognized equipment',
      unresolvedAthleteDescription: 'A piece of unrecognized equipment' }
    expect(await save('available_equipment', corrected, existing)).toMatchObject({ version: 2, content: corrected })
  })

  it('preserves intent records across confirmed correction, withdrawal, and re-confirmation', async () => {
    await f.actor(owner)
    const unverifiedBaseline = { ...intent, outcomes: [{ ...intent.outcomes[0],
      baseline: { status: 'referenced', observationId: randomUUID() } }] }
    await rejected(() => save('training_intent', unverifiedBaseline), '22023', 'Baseline does not match owned comparable evidence')
    const first = await save('training_intent', intent)
    const replacement = structuredClone(intent)
    replacement.outcomes[0].goal.statement = 'Train five days a week consistently'
    const request = randomUUID(), second = await save('training_intent', replacement, expected(first), request)
    expect(second).toMatchObject({ version: 2, content: { outcomes: [{ goal: { statement: replacement.outcomes[0].goal.statement } }] } })
    await f.db.query('SELECT * FROM public.review_coach_memory($1,$2,$3,$4)', [second.id, 'withdrawn', 'My goal has changed', randomUUID()])
    await rejected(() => save('training_intent', intent, expected(second)), '40001')
    await rejected(() => save('training_intent', intent), '40001')
    expect(await save('training_intent', intent, expected(second, 'withdrawn'))).toMatchObject({ version: 3,
      provenance: { source: 'mcp_coaching_context', confirmedBy: 'athlete' } })
    expect(await save('training_intent', replacement, expected(first), request)).toEqual(second)
    expect(await f.scalar('SELECT status AS value FROM coach_memories WHERE id=$1', [second.id])).toBe('withdrawn')
  })

  it('clears only confirmed constraints or movement preferences and rejects malformed or unsupported content', async () => {
    await f.actor(owner)
    const first = await save('training_constraints', constraints)
    const second = await save('exercise_preferences', preferences)
    expect(await save('training_constraints', clearConstraints, expected(first))).toMatchObject({ version: 2, content: clearConstraints })
    expect(await save('exercise_preferences', noPreferences, expected(second))).toMatchObject({ version: 2, content: noPreferences })
    for (const [key, content] of [
      ['training_schedule', {}], ['primary_goal', { goal: 'Ignored legacy goal' }],
      ['training_constraints', { constraints: 'Ankle pain', constraintKinds: ['no_running', 'no_running'] }],
      ['training_constraints', { constraints: 'Ankle pain', constraintKinds: ['diagnosis'] }],
      ['training_constraints', { constraints: ' ', constraintKinds: ['no_running'] }],
      ['training_constraints', { constraints: 'x'.repeat(10_001), constraintKinds: [] }],
      ['available_equipment', { equipment: 'I have a bench', resolvedEquipmentIds: ['made_up'] }],
      ['available_equipment', { ...reviewedEquipment, schemaVersion: 3 }],
      ['exercise_preferences', { ...noPreferences, entries: preferences.entries }],
      ['training_intent', { ...intent, outcomes: [] }], ['training_constraints', []],
    ] as const) await rejected(() => save(key, content), '22023')
    await rejected(() => save('training_constraints', constraints, { ...expected(first), version: 1.5 }), '22023')
    await rejected(() => save('training_constraints', constraints, null, null), '22023')
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_memories')).toBe(4)
  })

  it('isolates owners, denies table access, and denies RPC execution to anonymous and service roles', async () => {
    await f.actor(owner)
    const request = randomUUID(), first = await save('training_constraints', constraints, null, request)
    await rejected(() => f.db.query('SELECT * FROM coach_mcp_requirement_receipts'), '42501')
    await f.actor(foreign)
    await rejected(() => save('training_constraints', constraints, expected(first)), '40001')
    const foreignReceipt = await save('training_constraints', clearConstraints, null, request)
    expect(foreignReceipt).toMatchObject({ requestId: request, userId: foreign, content: clearConstraints, version: 1 })
    expect(foreignReceipt.id).not.toBe(first.id)
    await f.actor(owner)
    expect(await save('training_constraints', constraints, null, request)).toEqual(first)
    await f.actor(owner, 'anon')
    await rejected(() => save('training_constraints', constraints), '42501')
    await f.actor(owner, 'service_role')
    await rejected(() => save('training_constraints', constraints), '42501')
    await rejected(() => f.db.query('SELECT * FROM coach_mcp_requirement_receipts'), '42501')
    await f.db.exec("RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','',true)")
    await rejected(() => save('training_constraints', constraints), '42501')
  })

  it('rolls back the canonical correction and revision if its receipt cannot commit', async () => {
    await f.actor(owner)
    const first = await save('training_constraints', constraints)
    const revision = await f.scalar('SELECT revision AS value FROM coach_context_revisions')
    await f.db.exec(`RESET ROLE;
      CREATE FUNCTION public.test_deny_requirement_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic receipt failure'; END $$;
      CREATE TRIGGER test_deny_requirement_receipt BEFORE INSERT ON coach_mcp_requirement_receipts
        FOR EACH ROW EXECUTE FUNCTION public.test_deny_requirement_receipt()`)
    const replacementRequest = randomUUID()
    await f.actor(owner)
    await rejected(() => save('training_constraints', clearConstraints, expected(first), replacementRequest), 'P0001')
    expect(await f.scalar('SELECT status AS value FROM coach_memories WHERE id=$1', [first.id])).toBe('confirmed')
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_memories')).toBe(1)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_memory_review_events')).toBe(0)
    expect(await f.scalar('SELECT revision AS value FROM coach_context_revisions')).toBe(revision)
    await f.db.exec('RESET ROLE; DROP TRIGGER test_deny_requirement_receipt ON coach_mcp_requirement_receipts')
    await f.actor(owner)
    expect(await save('training_constraints', clearConstraints, expected(first), replacementRequest)).toMatchObject({ version: 2 })
  })

  it('removes receipts with the owning account and keeps the other account intact', async () => {
    await f.actor(owner)
    const request = randomUUID()
    await save('training_constraints', constraints, null, request)
    await f.actor(foreign)
    const first = await save('training_constraints', constraints, null, request)
    await save('training_constraints', clearConstraints, expected(first))
    await f.db.exec('RESET ROLE')
    await f.db.query('DELETE FROM auth.users WHERE id=$1', [foreign])
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_mcp_requirement_receipts WHERE user_id=$1', [foreign])).toBe(0)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_memories WHERE user_id=$1', [foreign])).toBe(0)
    expect(await f.scalar('SELECT count(*)::int AS value FROM coach_mcp_requirement_receipts WHERE user_id=$1', [owner])).toBe(1)
  })
})
