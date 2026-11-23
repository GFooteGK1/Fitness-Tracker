import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CoachingBearerDependencies, CoachingOAuthConfig } from '../../app/lib/auth/coaching-oauth'
import { handleCoachingMcp } from '../../app/lib/coach/coaching-mcp-http'
import { recommendationScope } from '../../app/lib/recommendations/context'
import { coachingDecisionRows } from '../fixtures/coaching-decision-record'
import { contextClient, contextRows, type ContextRows } from '../fixtures/coaching-context'
import { intent } from '../fixtures/personalized-coaching/intent'
import { workSnapshot } from '../fixtures/coach-performed-work'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'

const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const clock = '2026-10-19T00:13:53.447Z'
const tzOffset = 360
const localDate = '2026-10-18'
const draftResource = 'ui://socius/session-draft-v2.html'
const prepareName = 'prepare_today_session_draft'
const showName = 'show_today_session_draft'
const version = 'today-session-draft-v4'
const firstWorkout = '10000000-0000-4000-8000-000000000021'
const latestWorkout = '10000000-0000-4000-8000-000000000022'
const outsideWorkout = '10000000-0000-4000-8000-000000000023'
const nextWorkout = '10000000-0000-4000-8000-000000000024'
const config: CoachingOAuthConfig = {
  origin: 'https://socius.synthetic.invalid',
  supabaseUrl: 'https://auth.synthetic.invalid',
  issuer: 'https://auth.synthetic.invalid/auth/v1',
  resource: 'https://socius.synthetic.invalid/api/mcp',
  clientId: '20000000-0000-4000-8000-000000000001',
  publicKey: 'sb_publishable_synthetic',
  redirectUri: 'https://chatgpt.com/connector/oauth/synthetic-callback',
  resourceMetadataUrl: 'https://socius.synthetic.invalid/.well-known/oauth-protected-resource/api/mcp',
}

function workout(id: string, date: string) {
  return {
    ...structuredClone(workSnapshot().workouts[0]), id, workout_date: date, execution_status: 'completed',
    created_at: `${date}T10:00:00.000Z`, updated_at: `${date}T10:00:00.000Z`,
    notes: 'private workout narrative', input_text: 'private workout attachment',
  }
}

function seedRows(): ContextRows {
  const rows = contextRows()
  rows.coach_daily_checkins = [{ local_date: localDate, stress: 'usual', fatigue: 'usual', sleep: 'usual', soreness: 'usual', motivation: 'usual' }]
  rows.workouts = [
    workout(outsideWorkout, '2026-09-20'), workout(firstWorkout, '2026-09-21'), workout(latestWorkout, '2026-10-17'),
    // This source was recorded before the cutoff. Only the workout date excludes it.
    { ...workout(nextWorkout, '2026-10-19'), created_at: '2026-10-18T21:00:00.000Z', updated_at: '2026-10-18T21:00:00.000Z' },
  ]
  return rows
}

function seedRoutineReviewNotice(rows: ContextRows) {
  vi.stubEnv('RECOMMENDATIONS_ENABLED', 'true')
  const scope = recommendationScope(tzOffset)
  rows.recommendation_refresh_state = [{
    user_id: owner,
    source_revision: 3, response_revision: 0, processed_source_revision: 3, processed_response_revision: 0,
    current_recommendation_id: 'routine-review', last_error: null, next_due_at: null,
    processed_context: { activePlanId: 'accepted-one', intentMemoryId: 'memory-training_intent', intentVersion: 1,
      runtimeFingerprint: scope.runtimeFingerprint, localDate: scope.localDate, timezoneOffset: scope.tzOffset },
  }]
  rows.recommendations = [{
    id: 'routine-review', user_id: owner, local_date: localDate, timezone_offset: tzOffset, plan_version_id: 'accepted-one',
    intent_memory_id: 'memory-training_intent', intent_version: 1, source_revision: 3, response_revision: 0,
    lifecycle: 'active', valid_until: '2026-10-19T05:00:00.000Z', runtime_fingerprint: scope.runtimeFingerprint,
    scope_key: 'review:weekly-review-one', evidence_fingerprint: 'current', rule_id: 'accepted_plan.review',
    policy_version: 'bounded-actions-1', decision: { schemaVersion: 1, kind: 'action', ruleId: 'accepted_plan.review',
      policyVersion: 'bounded-actions-1', sourceRevision: 3, responseRevision: 0, title: 'Review your plan before training',
      reason: 'The evidence behind this weekly review changed.', reasonCodes: ['review_source_changed'], destination: { type: 'review' } },
  }]
}

function seedCanonicalReview(rows: ContextRows, action: 'continue' | 'pause_review' | 'recover', createdAt = '2026-10-16T12:00:00.000Z') {
  const { review } = coachingDecisionRows(owner)
  const setupKeys = ['primary_goal', 'training_schedule', 'available_equipment', 'training_constraints']
  const memories = Object.fromEntries(rows.coach_memories.filter(row => setupKeys.includes(String(row.memory_key))).map(row => [row.memory_key, {
    memoryId: row.id, memoryVersion: row.version, currentAtRead: true, content: row.content,
    lifecycle: { status: 'confirmed', effectiveFrom: null, effectiveUntil: null, reviewAfter: null },
  }]))
  const presentation = action === 'continue' ? 'same_track' : 'safety'
  const evidence = action === 'continue' ? 'sufficient' : 'safety_override'
  rows.coach_weekly_reviews = [{ ...review, program_id: 'program-one', base_plan_version_id: 'accepted-one',
    action, presentation_class: presentation, evidence_status: evidence, created_at: createdAt,
    rationale: { ...review.rationale, contextRevision: 2, setupMemoryBindings: { schemaVersion: 1, memories },
      planningDecision: { ...review.rationale.planningDecision, action, presentationClass: presentation, evidenceStatus: evidence },
    }, evidence_snapshot: { schemaVersion: 1, missing: [] },
  }]
}

function seedConcerningFeedback(rows: ContextRows, recordedAt: string) {
  rows.coach_checkins = [{ id: 'session-feedback-one', user_id: owner, program_id: 'program-one', plan_version_id: 'accepted-one',
    prescribed_session_id: 'past-session-one', checkin_type: 'session', occurred_at: '2026-10-15T12:00:00.000Z', created_at: recordedAt,
    'responses->>pain': 'concerning', responses: { outcome: 'stopped_early', sessionRpe: 7, energy: 'okay', pain: 'concerning', note: null } }]
}

async function connect({ subject = owner, rows = seedRows(), failTable, onSafetyFeedbackRead }: {
  subject?: string; rows?: ContextRows; failTable?: string; onSafetyFeedbackRead?: () => void
} = {}) {
  for (const records of Object.values(rows)) for (const row of records) row.user_id = subject
  const fixture = contextClient(rows, { failTable, onRead: (table, read) => {
    if (table !== 'coach_checkins' || !onSafetyFeedbackRead) return
    const query = fixture.traces.filter(trace => trace.table === table)[read - 1]
    if (query?.filters.some(([column]) => column === 'responses->>pain')) onSafetyFeedbackRead()
  } })
  Object.assign(fixture.db.auth, {
    getClaims: async () => ({ data: { claims: {
      iss: config.issuer, aud: config.resource, client_id: config.clientId, sub: subject,
      role: 'authenticated', scope: 'email', session_id: '30000000-0000-4000-8000-000000000001',
      exp: Math.floor(Date.now() / 1000) + 600,
    } }, error: null }),
    getUser: async () => ({ data: { user: { id: subject } }, error: null }),
  })
  const dependencies: CoachingBearerDependencies = {
    client: () => fixture.db,
    fetch: async (input, init) => {
      expect(String(input)).toBe(`${config.issuer}/oauth/userinfo`)
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-token')
      return Response.json({ sub: subject })
    },
  }
  const request = (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    handleCoachingMcp(new Request(input, init), config, dependencies)
  async function openClient() {
    const client = new Client({ name: 'synthetic-session-draft-client', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(config.resource), {
      requestInit: { headers: { Authorization: 'Bearer synthetic-token' } }, fetch: request,
    }))
    return client
  }
  return { ...fixture, client: await openClient(), openClient, rows }
}

const prepare = (arguments_: Record<string, unknown> = { tzOffset }) => ({ name: prepareName, arguments: arguments_ })

interface ReadyEvidence {
  status: 'ready'
  contextId: string
  evidence: { goals: { id: string }[] }
}

async function prepareReady(client: Client) {
  const result = await client.callTool(prepare())
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent).toMatchObject({ status: 'ready', workflowVersion: version,
    contextId: expect.any(String), evidence: { goals: [expect.objectContaining({ id: expect.any(String) })] } })
  return result.structuredContent as unknown as ReadyEvidence
}

function validDraft(goalId: string) {
  return {
    title: 'Synthetic track session for the 5 km goal',
    objective: 'Practice a repeatable aerobic running pace.',
    goalId,
    sourceWorkoutIds: [latestWorkout],
    weekReview: 'Two workouts are logged in this window. The later workout is recent work evidence.',
    checkInAdjustment: 'Usual readiness. Start at a comfortable effort and reassess.',
    rationale: 'The scheduled easy session supports repeatable running while preserving recovery.',
    planUse: 'follow',
    warmUp: [{ activity: 'Walk and ease into jogging', dose: '5 min', effort: 'Easy', rest: 'As needed' }],
    mainWork: [{ activity: 'Easy aerobic run', dose: '20 min', effort: 'Conversational', rest: 'Walk briefly if needed' }],
    supportingWork: [], cooldown: [],
    scaleWhen: 'Slow down if full sentences become difficult.', stopWhen: 'Stop for sharp or escalating pain.',
  }
}

const show = (contextId: string, draft: unknown) => ({ name: showName, arguments: { tzOffset, contextId, draft } })

describe('Today session draft over authenticated stateless MCP', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(clock)
    vi.stubEnv('SOCIUS_MCP_TODAY_OWNER_ID', owner)
    vi.stubEnv('SOCIUS_MCP_WRITES_ENABLED', 'false')
    vi.stubEnv('RECOMMENDATIONS_ENABLED', 'false')
  })

  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

  it('mounts read-only preparation and display for the verified Today owner without enabling writes', async () => {
    const { client, writes } = await connect()
    try {
      const tools = (await client.listTools()).tools
      for (const name of [prepareName, showName]) {
        expect(tools).toContainEqual(expect.objectContaining({ name, annotations: expect.objectContaining({ readOnlyHint: true }) }))
      }
      expect(tools.map(tool => tool.name)).not.toContain('save_socius_today_check_in')
      expect((await client.listResources()).resources).toContainEqual(expect.objectContaining({ uri: draftResource }))
      expect((await client.readResource({ uri: draftResource })).contents).toContainEqual(expect.objectContaining({
        uri: draftResource, mimeType: 'text/html;profile=mcp-app', text: expect.any(String),
      }))
      const legacyUri = 'ui://socius/session-draft-v1.html'
      expect((await client.readResource({ uri: legacyUri })).contents).toEqual(
        (await client.readResource({ uri: draftResource })).contents.map(content => ({ ...content, uri: legacyUri })),
      )
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('keeps draft tools and the rendering resource out of another verified athlete session', async () => {
    const { client, db, writes } = await connect({ subject: other })
    try {
      expect((await client.listTools()).tools.map(tool => tool.name)).not.toContain(prepareName)
      expect((await client.listTools()).tools.map(tool => tool.name)).not.toContain(showName)
      expect(client.getServerCapabilities()?.resources).toBeUndefined()
      await expect(client.callTool(prepare())).rejects.toMatchObject({ code: -32602 })
      await expect(client.callTool(show('a'.repeat(64), validDraft('goal:5k')))).rejects.toMatchObject({ code: -32602 })
      expect(db.from).not.toHaveBeenCalled()
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('rejects a caller-selected window before reading athlete evidence', async () => {
    const { client, db, writes } = await connect()
    try {
      const result = await client.callTool(prepare({ tzOffset, days: 7 }))
      expect(result.isError).toBe(true)
      expect(result.structuredContent ?? {}).not.toHaveProperty('contextId')
      expect(db.from).not.toHaveBeenCalled()
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('binds an automatic draft request to the verified check-in date across midnight', async () => {
    const { client, db, writes } = await connect()
    try {
      const action = prepare({ tzOffset, expectedLocalDate: localDate })
      expect((await client.callTool(action)).structuredContent).toMatchObject({ status: 'ready', evidence: { date: localDate } })
      const reads = vi.mocked(db.from).mock.calls.length
      vi.setSystemTime('2026-10-19T06:00:01.000Z')
      const delayed = await client.callTool(action)
      expect(delayed.isError).toBe(true)
      expect(delayed.structuredContent ?? {}).not.toHaveProperty('contextId')
      expect(delayed.content).toMatchObject([{ type: 'text', text: expect.stringContaining('different local date') }])
      expect(db.from).toHaveBeenCalledTimes(reads)
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('freezes the inclusive 28-day evidence, playbook publication, and one editable draft with no writes', async () => {
    vi.stubEnv('SOCIUS_MCP_WRITES_ENABLED', 'true')
    const { client, rows, writes, traces } = await connect()
    const saved = structuredClone(rows)
    try {
      const prepared = await client.callTool(prepare())
      expect(prepared.isError).not.toBe(true)
      expect(prepared.structuredContent).toMatchObject({ status: 'ready', workflowVersion: version, contextId: expect.any(String), evidence: {
        date: localDate, window: { startsOn: '2026-09-21', endsOn: localDate },
        goals: [expect.objectContaining({ id: 'goal:5k', statement: 'Improve 5000 meter time' })],
        daySchedule: 'planned', hasPlannedSession: true,
        historyCoverage: { complete: true, athleteCoverage: 'unknown' },
        checkIn: { fatigue: 'usual', sleep: 'usual' }, checkInScale: 'relative-to-usual',
        playbook: { version: 'external-coaching-0.2.0', contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          selectedDomains: ['assessment', 'conditioning', 'recovery'] },
        weeks: [
          { startsOn: '2026-09-21', endsOn: '2026-09-27', workoutIds: [firstWorkout], loggedWorkoutCount: 1 },
          { startsOn: '2026-09-28', endsOn: '2026-10-04', workoutIds: [], loggedWorkoutCount: 0 },
          { startsOn: '2026-10-05', endsOn: '2026-10-11', workoutIds: [], loggedWorkoutCount: 0 },
          { startsOn: '2026-10-12', endsOn: localDate, workoutIds: [latestWorkout], loggedWorkoutCount: 1 },
        ], alreadyTrainedToday: false,
      } })
      const packet = prepared.structuredContent as unknown as ReadyEvidence & {
        evidence: { workouts: { id: string; date: string }[]; playbook: { version: string; contentHash: string } }
      }
      expect(packet.evidence.workouts.map(({ id, date }) => [id, date]).sort()).toEqual([
        [firstWorkout, '2026-09-21'], [latestWorkout, '2026-10-17'],
      ])
      const reference = await client.callTool({ name: 'get_coaching_reference', arguments: { version: packet.evidence.playbook.version } })
      expect(reference.structuredContent).toMatchObject({ reference: {
        version: packet.evidence.playbook.version, contentHash: packet.evidence.playbook.contentHash,
      } })
      expect(JSON.stringify(prepared)).not.toContain('private workout narrative')
      expect(JSON.stringify(prepared)).not.toContain('private workout attachment')

      const draft = validDraft(packet.evidence.goals[0].id)
      const shown = await client.callTool(show(packet.contextId, draft))
      expect(shown.isError).not.toBe(true)
      expect(shown.structuredContent).toMatchObject({ status: 'validated', date: localDate, contextId: packet.contextId })
      expect(shown._meta?.sessionDraft).toBeDefined()
      expect(JSON.stringify(shown._meta?.sessionDraft)).toContain(draft.title)
      expect(JSON.stringify(shown.content)).not.toContain(draft.title)
      expect(rows).toEqual(saved)
      expect(traces.every(trace => trace.filters.some(([key, value]) => key === 'user_id' && value === owner))).toBe(true)
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it.each([
    { goalType: 'typed hypertrophy', selectedDomains: ['assessment', 'strength', 'recovery'], goalId: 'goal:hypertrophy' },
    { goalType: 'legacy', selectedDomains: ['assessment', 'recovery'], goalId: 'primary_goal' },
  ])('automatically supplies the programming guide for a $goalType goal before drafting', async ({ goalType, selectedDomains, goalId }) => {
    const rows = seedRows()
    if (goalType === 'typed hypertrophy') {
      const memory = rows.coach_memories.find(row => row.memory_key === 'training_intent')!
      const strengthIntent = intent()
      const goal = strengthIntent.outcomes[0].goal
      strengthIntent.outcomes[0] = {
        ...strengthIntent.outcomes[0], domain: 'hypertrophy', measurement: null,
        binding: { movementId: null, distance: null, equipmentIds: [], variation: null },
        goal: { ...goal, id: goalId, kind: 'process', statement: 'Train consistently to build upper-body muscle',
          requiredQualityIds: ['training_adherence'] },
      }
      memory.content = strengthIntent
    } else {
      rows.coach_memories = rows.coach_memories.filter(row => row.memory_key !== 'training_intent')
    }
    const { client, writes } = await connect({ rows })
    try {
      const prepared = await client.callTool(prepare())
      expect(prepared.isError).not.toBe(true)
      expect(prepared.structuredContent).toMatchObject({ status: 'ready', evidence: {
        goals: [expect.objectContaining({ id: goalId })],
        playbook: { version: 'external-coaching-0.2.0', selectedDomains,
          reference: { programmingGuide: { steps: expect.arrayContaining([
            expect.objectContaining({ id: 'set_build_and_maintenance_dose' }),
            expect.objectContaining({ id: 'review_month' }),
          ]) } } },
      } })
      const packet = prepared.structuredContent as unknown as { evidence: { playbook: unknown } }
      const reference = await client.callTool({ name: 'get_coaching_reference', arguments: { domains: selectedDomains } })
      expect(reference.isError).toBe(false)
      expect(reference.structuredContent).toEqual({ reference: packet.evidence.playbook })
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it.each([
    ['unknown goal', { goalId: 'foreign-goal' }],
    ['out-of-window workout', { sourceWorkoutIds: [outsideWorkout] }],
    ['duplicate workout', { sourceWorkoutIds: [latestWorkout, latestWorkout] }],
    ['missing main work', { mainWork: [] }],
    ['blank stop criteria', { stopWhen: ' ' }],
    ['new plan despite a scheduled session', { planUse: 'new' }],
  ])('rejects %s before rendering a draft', async (_label, change) => {
    const { client, writes } = await connect()
    try {
      const prepared = await prepareReady(client)
      const result = await client.callTool(show(prepared.contextId, { ...validDraft(prepared.evidence.goals[0].id), ...change }))
      expect(result.isError).toBe(true)
      expect(result._meta?.sessionDraft).toBeUndefined()
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('keeps the evidence binding stable after reconnect and rejects it after a saved correction', async () => {
    const { client, openClient, rows, writes } = await connect()
    try {
      const prepared = await prepareReady(client)
      vi.setSystemTime('2026-10-19T00:14:53.447Z')
      const freshClient = await openClient()
      try {
        expect((await prepareReady(freshClient)).contextId).toBe(prepared.contextId)
      } finally { await freshClient.close() }
      rows.workouts[2] = { ...rows.workouts[2], capture_revision: 2, updated_at: '2026-10-19T00:14:00.000Z' }
      const expired = await client.callTool(show(prepared.contextId, validDraft(prepared.evidence.goals[0].id)))
      expect(expired.isError).toBe(true)
      expect(expired._meta?.sessionDraft).toBeUndefined()
      const fresh = await client.callTool(prepare())
      expect(fresh.structuredContent).toMatchObject({ status: 'ready', contextId: expect.any(String), evidence: { workouts: expect.arrayContaining([
        expect.objectContaining({ id: latestWorkout, revision: 2 }),
      ]) } })
      expect(fresh.structuredContent).not.toMatchObject({ contextId: prepared.contextId })
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('uses updated coaching declarations in a fresh draft and keeps the accepted session as saved', async () => {
    const { client, openClient, rows, writes } = await connect()
    try {
      const previous = await prepareReady(client)
      const updatedIntent = intent()
      updatedIntent.outcomes[0].goal.statement = 'Build back toward a comfortable 5000 meter run'
      const replacements = {
        training_intent: updatedIntent,
        available_equipment: { equipment: 'Adjustable dumbbells and a bench', resolvedEquipmentIds: ['dumbbell', 'bench'] },
        training_constraints: { constraints: 'No running while I recover from my reported ankle injury', constraintKinds: ['no_running'] },
        exercise_preferences: { schemaVersion: 1, state: 'specified', entries: [
          { athleteWording: 'I prefer step-ups', target: { kind: 'unresolved' } },
          { athleteWording: 'I prefer to skip burpees', target: { kind: 'unresolved' } },
        ] },
      }
      const savedPlan = structuredClone(rows.training_plan_versions)
      const savedSessions = structuredClone(rows.prescribed_sessions)
      for (const [key, content] of Object.entries(replacements)) {
        const current = rows.coach_memories.find(row => row.memory_key === key)!
        current.status = 'superseded'
        rows.coach_memories.push({ ...current, id: `new-${key}`, version: 2, status: 'confirmed', content })
      }
      const fresh = await openClient()
      try {
        expect((await fresh.callTool(prepare())).structuredContent).toMatchObject({ status: 'ready', evidence: {
          goals: [expect.objectContaining({ statement: updatedIntent.outcomes[0].goal.statement, source: { id: 'new-training_intent', version: 2 } })],
          requirements: {
            available_equipment: { value: replacements.available_equipment, source: { version: 2 } },
            training_constraints: { value: replacements.training_constraints, source: { version: 2 } },
            exercise_preferences: { value: replacements.exercise_preferences, source: { version: 2 } },
          },
          acceptedSession: { planId: 'accepted-one' },
        } })
        expect((await fresh.callTool(show(previous.contextId, validDraft(previous.evidence.goals[0].id)))).isError).toBe(true)
      } finally { await fresh.close() }
      expect(rows.training_plan_versions).toEqual(savedPlan)
      expect(rows.prescribed_sessions).toEqual(savedSessions)
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('requires a review when a confirmed training restriction reaches its review date', async () => {
    const { client, rows, writes } = await connect()
    try {
      const previous = await prepareReady(client)
      const restriction = rows.coach_memories.find(row => row.memory_key === 'training_constraints')!
      restriction.content = { constraints: 'No overhead lifting', constraintKinds: ['no_overhead'] }
      restriction.review_after = '2026-10-18T22:30:00.000Z'
      expect((await client.callTool(prepare())).structuredContent).toMatchObject({ status: 'review_required',
        message: expect.stringContaining('saved training restrictions') })
      expect((await client.callTool(show(previous.contextId, validDraft(previous.evidence.goals[0].id)))).isError).toBe(true)
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('rejects a prepared draft after the athlete’s date rolls over', async () => {
    const { client, writes } = await connect()
    try {
      const prepared = await prepareReady(client)
      vi.setSystemTime('2026-10-19T06:00:01.000Z')
      const result = await client.callTool(show(prepared.contextId, validDraft(prepared.evidence.goals[0].id)))
      expect(result.isError).toBe(true)
      expect(result._meta?.sessionDraft).toBeUndefined()
      expect((await client.callTool(prepare())).structuredContent).toMatchObject({ status: 'needs_input' })
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('includes a completed workout on the end date and binds the current same-day assessment', async () => {
    const rows = seedRows(), todayWorkout = '10000000-0000-4000-8000-000000000026'
    rows.workouts.push(workout(todayWorkout, localDate))
    const { client, writes } = await connect({ rows })
    try {
      const ready = await client.callTool(prepare())
      expect(ready.structuredContent).toMatchObject({ status: 'ready', evidence: { alreadyTrainedToday: true,
        workouts: expect.arrayContaining([expect.objectContaining({ id: todayWorkout, date: localDate })]),
      } })
      const prepared = ready.structuredContent as unknown as ReadyEvidence
      rows.coach_daily_checkins[0].fatigue = 'higher'
      const expired = await client.callTool(show(prepared.contextId, validDraft(prepared.evidence.goals[0].id)))
      expect(expired.isError).toBe(true)
      expect(expired._meta?.sessionDraft).toBeUndefined()
      expect((await client.callTool(prepare())).structuredContent).toMatchObject({ status: 'ready', evidence: {
        checkIn: { fatigue: 'higher' }, checkInScale: 'relative-to-usual',
      } })
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('binds exact 1-to-5 ratings even when a correction leaves the old relative answers unchanged', async () => {
    const rows = seedRows()
    Object.assign(rows.coach_daily_checkins[0], {
      stress: 'higher', fatigue: 'lower', sleep: 'better', soreness: 'usual', motivation: 'higher',
      stress_rating: 1, fatigue_rating: 4, sleep_rating: 5, soreness_rating: 3, motivation_rating: 5,
    })
    const { client, writes } = await connect({ rows })
    try {
      const prepared = await prepareReady(client)
      expect(prepared.evidence).toMatchObject({
        checkInScale: '1-to-5', checkIn: { stress: 1, fatigue: 4, sleep: 5, soreness: 3, motivation: 5 },
      })
      rows.coach_daily_checkins[0].stress_rating = 2
      const old = await client.callTool(show(prepared.contextId, validDraft(prepared.evidence.goals[0].id)))
      expect(old.isError).toBe(true)
      expect(old._meta?.sessionDraft).toBeUndefined()
      const fresh = await prepareReady(client)
      expect(fresh.contextId).not.toBe(prepared.contextId)
      expect(fresh.evidence).toMatchObject({ checkInScale: '1-to-5', checkIn: { stress: 2 } })
      const shown = await client.callTool(show(fresh.contextId, validDraft(fresh.evidence.goals[0].id)))
      expect(shown.structuredContent).toMatchObject({ status: 'validated' })
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it.each(['missing-check-in', 'no-history', 'no-goal'])('requests input for %s', async missing => {
    const rows = seedRows()
    if (missing === 'missing-check-in') rows.coach_daily_checkins = [{ ...rows.coach_daily_checkins[0], local_date: '2026-10-17' }]
    if (missing === 'no-history') rows.workouts = []
    if (missing === 'no-goal') rows.coach_memories = rows.coach_memories.filter(row => row.kind !== 'goal')
    const { client, writes } = await connect({ rows })
    try {
      const result = await client.callTool(prepare())
      expect(result.structuredContent).toMatchObject({ status: 'needs_input', workflowVersion: version, message: expect.any(String) })
      expect(result.structuredContent ?? {}).not.toHaveProperty('contextId')
      expect(result._meta?.sessionDraft).toBeUndefined()
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it.each(['coach_daily_checkins', 'workouts', 'coach_weekly_reviews', 'coach_checkins'])('reports an unavailable %s read without producing a draft', async failTable => {
    const { client, writes } = await connect({ failTable })
    try {
      const result = await client.callTool(prepare())
      expect(result.structuredContent).toMatchObject({ status: 'unavailable', workflowVersion: version, message: expect.any(String) })
      expect(result.structuredContent ?? {}).not.toHaveProperty('contextId')
      expect(result._meta?.sessionDraft).toBeUndefined()
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('retains a usable partial history and discloses that logging coverage is unknown', async () => {
    const rows = seedRows()
    rows.workouts.push({ ...workout('10000000-0000-4000-8000-000000000025', '2026-10-05'), blocks: null })
    const { client, writes } = await connect({ rows })
    try {
      const result = await client.callTool(prepare())
      expect(result.structuredContent).toMatchObject({ status: 'ready', evidence: {
        historyCoverage: { complete: false, athleteCoverage: 'unknown' },
        workouts: expect.arrayContaining([expect.objectContaining({ id: latestWorkout })]),
      } })
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it.each(['pause_review', 'recover'] as const)('preserves a stored %s safety hold after unrelated context changes', async action => {
    const { client, rows, writes } = await connect()
    try {
      const ready = await prepareReady(client)
      seedCanonicalReview(rows, action)
      const prepared = await client.callTool(prepare())
      expect(prepared.structuredContent).toMatchObject({ status: 'review_required', workflowVersion: version,
        message: 'Review your saved plan before drafting a session.' })
      expect(prepared.structuredContent ?? {}).not.toHaveProperty('contextId')
      const shown = await client.callTool(show(ready.contextId, validDraft(ready.evidence.goals[0].id)))
      expect(shown.isError).toBe(true)
      expect(shown._meta?.sessionDraft).toBeUndefined()
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('allows a daily draft despite a stale routine weekly review and cached routine review notice', async () => {
    const rows = seedRows()
    seedCanonicalReview(rows, 'continue')
    seedRoutineReviewNotice(rows)
    const { client, traces, writes } = await connect({ rows })
    try {
      const prepared = await client.callTool(prepare())
      expect(prepared.structuredContent).toMatchObject({ status: 'ready', workflowVersion: version, evidence: {
        hasPlannedSession: true, acceptedSession: { planId: 'accepted-one',
          sessions: [{ status: 'planned', prescription: { title: 'Saved easy session' } }] },
      } })
      expect(prepared.structuredContent).not.toHaveProperty('evidence.acceptedSession.review')
      const result = prepared.structuredContent as unknown as ReadyEvidence
      seedCanonicalReview(rows, 'continue', '2026-10-18T12:00:00.000Z')
      const shown = await client.callTool(show(result.contextId, validDraft(result.evidence.goals[0].id)))
      expect(shown.structuredContent).toMatchObject({ status: 'validated' })
      expect(traces.some(trace => trace.table === 'recommendation_refresh_state' || trace.table === 'recommendations')).toBe(false)
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('allows a new session draft when there is no accepted plan', async () => {
    const rows = seedRows()
    rows.training_programs = []
    const { client, writes } = await connect({ rows })
    try {
      const prepared = await client.callTool(prepare())
      expect(prepared.structuredContent).toMatchObject({ status: 'ready', evidence: {
        daySchedule: 'unscheduled', hasPlannedSession: false, acceptedSession: { planId: null, sessions: [] },
      } })
      const result = prepared.structuredContent as unknown as ReadyEvidence
      const shown = await client.callTool(show(result.contextId, { ...validDraft(result.evidence.goals[0].id), planUse: 'new' }))
      expect(shown.structuredContent).toMatchObject({ status: 'validated' })
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('validates rest and light recovery on a verified scheduled rest day through the same tools', async () => {
    const rows = seedRows()
    const { plan, intent } = reviewedRollingWeek('2026-10-12')
    expect(plan.windowEnd).toBe(localDate)
    expect(plan.scheduledSessions.some(session => session.scheduledDate === localDate)).toBe(false)
    Object.assign(rows.training_plan_versions[0], {
      intent, plan_mode: 'rolling_weekly', window_start: plan.windowStart, window_end: plan.windowEnd,
      input_snapshot: { reviewedExecutionStorage: 'reviewed_execution_slots_v1' },
    })
    rows.coach_effective_prescribed_sessions = plan.scheduledSessions.map((session, index) => ({
      id: `effective-${index}`, program_id: 'program-one', plan_version_id: 'accepted-one',
      execution_plan_version_id: 'accepted-one', week_number: 1, session_index: index + 1,
      scheduled_date: session.scheduledDate, prescription: session.prescription, status: 'planned',
      completed_workout_id: null, completion_contract_version: null, has_reports: false,
    }))
    const { client, writes } = await connect({ rows })
    try {
      const prepared = await prepareReady(client)
      expect(prepared.evidence).toMatchObject({
        daySchedule: 'scheduled_rest', hasPlannedSession: false,
        window: { startsOn: '2026-09-21', endsOn: localDate },
        acceptedSession: { planId: 'accepted-one', sessions: [] },
      })
      const draft = validDraft(prepared.evidence.goals[0].id)
      const wrong = await client.callTool(show(prepared.contextId, { ...draft, dayType: 'training' }))
      expect(wrong.isError).toBe(true)
      expect(wrong._meta?.sessionDraft).toBeUndefined()

      const rest = { ...draft, title: 'Keep the scheduled rest day', objective: 'Recover for the next planned session.',
        dayType: 'rest', warmUp: [], mainWork: [] }
      const hiddenTraining = await client.callTool(show(prepared.contextId, { ...rest, mainWork: draft.mainWork }))
      expect(hiddenTraining.isError).toBe(true)
      const shownRest = await client.callTool(show(prepared.contextId, rest))
      expect(shownRest.structuredContent).toMatchObject({ status: 'validated' })
      expect(shownRest._meta?.sessionDraft).toMatchObject({
        dayType: 'rest', daySchedule: 'scheduled_rest', planUse: 'follow', warmUp: [], mainWork: [],
      })

      const recovery = { ...rest, dayType: 'recovery',
        mainWork: [{ activity: 'Easy walk', dose: '10 min', effort: 'Comfortable', rest: 'As needed' }] }
      const shownRecovery = await client.callTool(show(prepared.contextId, recovery))
      expect(shownRecovery.structuredContent).toMatchObject({ status: 'validated' })
      expect(shownRecovery._meta?.sessionDraft).toMatchObject({ dayType: 'recovery', daySchedule: 'scheduled_rest' })
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it('blocks concerning feedback even after a newer ordinary plan review', async () => {
    const rows = seedRows()
    seedCanonicalReview(rows, 'continue')
    const { client, writes } = await connect({ rows })
    try {
      const pending = await prepareReady(client)
      seedConcerningFeedback(rows, '2026-10-17T12:00:00.000Z')
      expect((await client.callTool(prepare())).structuredContent).toMatchObject({ status: 'review_required',
        message: expect.stringContaining('concerning pain') })
      expect((await client.callTool(show(pending.contextId, validDraft(pending.evidence.goals[0].id)))).isError).toBe(true)

      seedCanonicalReview(rows, 'continue', '2026-10-18T12:00:00.000Z')
      expect((await client.callTool(prepare())).structuredContent).toMatchObject({ status: 'review_required',
        message: expect.stringContaining('concerning pain') })
      expect(writes).not.toHaveBeenCalled()
    } finally { await client.close() }
  })

  it.each([
    { change: 'pause review', status: 'review_required', apply: (rows: ContextRows) => seedCanonicalReview(rows, 'pause_review') },
    { change: 'recover review', status: 'review_required', apply: (rows: ContextRows) => seedCanonicalReview(rows, 'recover') },
    { change: 'accepted base', status: 'unavailable', apply: (rows: ContextRows) => {
      rows.training_programs[0].active_plan_version_id = 'accepted-two'
    } },
  ])('rechecks a concurrent $change after reading concerning feedback', async ({ status, apply }) => {
    const rows = seedRows()
    const prepareClient = await connect({ rows, onSafetyFeedbackRead: () => apply(rows) })
    try {
      expect((await prepareClient.client.callTool(prepare())).structuredContent).toMatchObject({ status })
      expect(prepareClient.writes).not.toHaveBeenCalled()
    } finally { await prepareClient.client.close() }

    const displayRows = seedRows()
    let changeEnabled = false
    const displayClient = await connect({ rows: displayRows, onSafetyFeedbackRead: () => {
      if (changeEnabled) apply(displayRows)
    } })
    try {
      const pending = await prepareReady(displayClient.client)
      changeEnabled = true
      const shown = await displayClient.client.callTool(show(pending.contextId, validDraft(pending.evidence.goals[0].id)))
      expect(shown.isError).toBe(true)
      expect(shown._meta?.sessionDraft).toBeUndefined()
      expect(displayClient.writes).not.toHaveBeenCalled()
    } finally { await displayClient.client.close() }
  })
})
