import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CoachingBearerDependencies, CoachingOAuthConfig } from '../../app/lib/auth/coaching-oauth'
import { handleCoachingMcp } from '../../app/lib/coach/coaching-mcp-http'
import { recommendationScope } from '../../app/lib/recommendations/context'
import { coachingDecisionRows } from '../fixtures/coaching-decision-record'
import { contextClient, contextRows, type ContextRows } from '../fixtures/coaching-context'
import { workSnapshot } from '../fixtures/coach-performed-work'

const owner = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const clock = '2026-10-19T00:13:53.447Z'
const tzOffset = 360
const localDate = '2026-10-18'
const draftResource = 'ui://socius/session-draft-v1.html'
const prepareName = 'prepare_today_session_draft'
const showName = 'show_today_session_draft'
const version = 'today-session-draft-v1'
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

function seedReviewHold(rows: ContextRows) {
  vi.stubEnv('RECOMMENDATIONS_ENABLED', 'true')
  const scope = recommendationScope(tzOffset)
  rows.recommendation_refresh_state = [{
    user_id: owner,
    source_revision: 3, response_revision: 0, processed_source_revision: 3, processed_response_revision: 0,
    current_recommendation_id: 'hold-for-review', last_error: null, next_due_at: null,
    processed_context: { activePlanId: 'accepted-one', intentMemoryId: 'memory-training_intent', intentVersion: 1,
      runtimeFingerprint: scope.runtimeFingerprint, localDate: scope.localDate, timezoneOffset: scope.tzOffset },
  }]
  rows.recommendations = [{
    id: 'hold-for-review', user_id: owner, local_date: localDate, timezone_offset: tzOffset, plan_version_id: 'accepted-one',
    intent_memory_id: 'memory-training_intent', intent_version: 1, source_revision: 3, response_revision: 0,
    lifecycle: 'active', valid_until: '2026-10-19T05:00:00.000Z', runtime_fingerprint: scope.runtimeFingerprint,
    scope_key: 'review:weekly-review-one', evidence_fingerprint: 'current', rule_id: 'accepted_plan.review',
    policy_version: 'bounded-actions-1', decision: { schemaVersion: 1, kind: 'action', ruleId: 'accepted_plan.review',
      policyVersion: 'bounded-actions-1', sourceRevision: 3, responseRevision: 0, title: 'Review your plan before training',
      reason: 'Your saved weekly review calls for a review.', destination: { type: 'review' } },
  }]
}

function seedCanonicalReviewHold(rows: ContextRows) {
  const { review } = coachingDecisionRows(owner)
  const setupKeys = ['primary_goal', 'training_schedule', 'available_equipment', 'training_constraints']
  const memories = Object.fromEntries(rows.coach_memories.filter(row => setupKeys.includes(String(row.memory_key))).map(row => [row.memory_key, {
    memoryId: row.id, memoryVersion: row.version, currentAtRead: true, content: row.content,
    lifecycle: { status: 'confirmed', effectiveFrom: null, effectiveUntil: null, reviewAfter: null },
  }]))
  rows.coach_weekly_reviews = [{ ...review, program_id: 'program-one', base_plan_version_id: 'accepted-one',
    action: 'pause_review', presentation_class: 'safety', evidence_status: 'safety_override',
    rationale: { ...review.rationale, contextRevision: 3, setupMemoryBindings: { schemaVersion: 1, memories },
      planningDecision: { ...review.rationale.planningDecision, action: 'pause_review', presentationClass: 'safety', evidenceStatus: 'safety_override' },
    }, evidence_snapshot: { schemaVersion: 1, missing: [] },
  }]
}

async function connect({ subject = owner, rows = seedRows(), failTable }: {
  subject?: string; rows?: ContextRows; failTable?: string
} = {}) {
  for (const records of Object.values(rows)) for (const row of records) row.user_id = subject
  const fixture = contextClient(rows, { failTable })
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

  it('freezes the inclusive 28-day evidence, playbook publication, and one editable draft with no writes', async () => {
    vi.stubEnv('SOCIUS_MCP_WRITES_ENABLED', 'true')
    const { client, rows, writes, traces } = await connect()
    const saved = structuredClone(rows)
    try {
      const prepared = await client.callTool(prepare())
      expect(prepared.isError).not.toBe(true)
      expect(prepared.structuredContent).toMatchObject({ status: 'ready', workflowVersion: version, contextId: expect.any(String), evidence: {
        date: localDate, window: { startsOn: '2026-09-21', endsOn: localDate },
        goals: [expect.objectContaining({ id: 'goal:5k', statement: 'Improve 5000 meter time' })], hasPlannedSession: true,
        historyCoverage: { complete: true, athleteCoverage: 'unknown' },
        checkIn: { fatigue: 'usual', sleep: 'usual' },
        playbook: { version: expect.any(String), contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
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
        checkIn: { fatigue: 'higher' },
      } })
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

  it.each(['coach_daily_checkins', 'workouts', 'coach_weekly_reviews'])('reports an unavailable %s read without producing a draft', async failTable => {
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

  it.each([
    ['Today recommendation', seedReviewHold], ['canonical weekly review with Today recommendations disabled', seedCanonicalReviewHold],
  ] as const)('blocks a draft after discovering a hold from %s', async (_label, seedHold) => {
    const { client, rows, writes } = await connect()
    try {
      const ready = await prepareReady(client)
      seedHold(rows)
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
})
