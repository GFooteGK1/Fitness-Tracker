import { expect, test, type Page, type Route } from '@playwright/test'
import { buildProgrammingProfile, validateCompleteCoachPlanningInput } from '../app/lib/coach/complete-intake'
import { buildCompleteEightWeekPlan } from '../app/lib/coach/complete-program'

const origin = 'http://127.0.0.1:3010'
const userId = '99999999-9999-4999-8999-999999999999'
const sessionId = '11111111-1111-4111-8111-111111111111'
const workoutId = '33333333-3333-4333-8333-333333333333'
const email = 'feedback-browser@test.invalid'
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', email, exp: 4102444800 })).toString('base64url'), 'signature'].join('.')
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

function runtime() {
  const input = validateCompleteCoachPlanningInput({ format: 'complete_programming_intake_v0_3', primaryDomain: 'strength',
    goal: 'Build repeatable strength', experience: 'consistent', trainingDays: ['monday', 'wednesday', 'friday'],
    sessionMinutes: 60, equipment: 'Bodyweight, barbell, rack', resolvedEquipmentIds: ['bodyweight', 'barbell', 'rack'],
    constraints: '', constraintKinds: [], secondaryGoals: [], startDate: '2026-09-14' })
  if (!input.ok) throw new Error(input.errors.join('; '))
  const prescription = buildCompleteEightWeekPlan(buildProgrammingProfile(input.value, [])).weeks[0].sessions[0]
  return { userId, generatedAt: '2026-09-17T15:00:00Z', storageAvailable: true, capabilities: { feedbackV2: true },
    doctrineVersion: '0.1.0', policyVersion: '0.1.0', assessments: [], memories: [], activeProgram: {
      id: '22222222-2222-4222-8222-222222222222', title: 'Repeatable strength', goalSummary: 'Build repeatable strength',
      startDate: '2026-09-14', endDate: '2026-11-08', activePlanVersionId: '44444444-4444-4444-8444-444444444444',
      planVersion: 1, currentWeek: 1, currentWeekRole: null, referenceVersion: '0.1.0', policyVersion: '0.1.0',
      weeks: [], sessionCheckins: [], currentWeekReview: null, upcomingSessions: [{
        id: sessionId, weekNumber: 1, sessionIndex: 1, scheduledDate: '2026-09-17', prescription,
        status: 'planned', completionContractVersion: null, completedWorkoutId: null, scheduledMeasurements: []
      }]
    } }
}

async function setup(page: Page) {
  const context = runtime()
  const unexpected: string[] = []
  await page.clock.setFixedTime(new Date('2026-09-17T15:00:00Z'))
  await page.context().addCookies([{ name: 'sb-placeholder-auth-token',
    value: encodeURIComponent(JSON.stringify([token, 'local-refresh-token', null, null, null])), url: origin, sameSite: 'Lax' }])
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue()
    if (url.origin === 'https://placeholder.supabase.co') {
      if (url.pathname === '/auth/v1/user') return json(route, { id: userId, aud: 'authenticated', role: 'authenticated', email })
      if (url.pathname === '/rest/v1/user_profiles') return json(route, { user_id: userId, fitness_goals: ['Build repeatable strength'],
        activity_level: 'moderately_active', body_metrics: { age: 40 }, preferences: { units: 'imperial' }, medical_conditions: [] })
    }
    if (url.origin === origin) {
      if (url.pathname === '/api/recommendations/refresh') return json(route, { status: 'disabled', recommendations: [], refreshState: null })
      if (url.pathname === '/api/capture/drafts') return json(route, { userId, drafts: [] })
      if (url.pathname === '/api/coach') return json(route, { context })
      if (url.pathname === '/api/coach/intent') return json(route, { enabled: false, snapshot: null })
      if (url.pathname === '/api/coach/trust') return json(route, { exercisePreferencesEnabled: false, trust: {
        available: true, memories: [], imports: [], goals: [], qualities: [], signalSummary: [], proposals: []
      } })
      if (url.pathname === '/api/coach/weekly') return json(route, { mode: 'rolling_weekly', program: null, currentWeek: null, pendingProposal: null, history: [] })
      if (url.pathname === `/api/coach/sessions/${sessionId}/signals`) return json(route, { signals: [] })
      if (url.pathname === '/api/whoop/sync') return json(route, { isConnected: false, lastSyncAt: null, status: 'idle' })
      if (url.pathname === '/api/whoop/initialize') return json(route, { initialized: false })
    }
    unexpected.push(`${route.request().method()} ${url.href}`)
    return route.abort('blockedbyclient')
  })
  return { context, unexpected }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`optional feedback stays unknown and usable in ${colorScheme}`, async ({ page }) => {
    const { context, unexpected } = await setup(page)
    const requests: any[] = []
    await page.route(`${origin}/api/coach/sessions/${sessionId}/complete`, async route => {
      requests.push(route.request().postDataJSON())
      context.activeProgram.upcomingSessions[0].status = 'completed'
      return json(route, { result: { prescribed_session_id: sessionId, checkin_id: '55555555-5555-4555-8555-555555555555', workout_id: workoutId }, context })
    })
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.goto('/program')
    await page.getByRole('button', { name: 'Finish or skip session' }).click()
    await expect(page.getByLabel('Session RPE', { exact: true })).toHaveValue('')
    await expect(page.getByRole('button', { name: 'okay', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await page.getByLabel('Confirm completed prescribed work').check()
    const save = page.getByRole('button', { name: 'Save workout', exact: true })
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
      expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await expect(page.getByLabel('Session RPE', { exact: true })).toHaveCSS('font-size', '16px')
      await page.screenshot({ path: `output/playwright/app-quality-results/feedback-${colorScheme}-${width}.png`, fullPage: true })
    }
    await save.focus()
    await expect(save).toBeFocused()
    await page.keyboard.press('Enter')
    await expect.poll(() => requests.length).toBe(1)
    expect(requests[0].feedback).toMatchObject({ feedbackVersion: 2, sessionRpe: null, energy: null, pain: null })
    expect(requests[0].observations).toEqual([])
    expect(unexpected).toEqual([])
  })
}

test('fractional explicit feedback retries the identical interrupted completion', async ({ page }) => {
  const { context, unexpected } = await setup(page)
  const requests: any[] = []
  await page.route(`${origin}/api/coach/sessions/${sessionId}/complete`, async route => {
    requests.push(route.request().postDataJSON())
    if (requests.length === 1) return route.abort('connectionfailed')
    context.activeProgram.upcomingSessions[0].status = 'completed'
    return json(route, { result: { prescribed_session_id: sessionId, checkin_id: '55555555-5555-4555-8555-555555555555', workout_id: workoutId }, context })
  })
  await page.goto('/program')
  await page.getByRole('button', { name: 'Something changed' }).click()
  await page.getByLabel('Pain signal', { exact: true }).selectOption('none')
  await page.getByRole('button', { name: 'Finish or skip session' }).click()
  await page.getByLabel('Session RPE', { exact: true }).fill('7.5')
  await page.getByLabel('Confirm completed prescribed work').check()
  await page.getByRole('button', { name: 'Save workout', exact: true }).click()
  await page.getByRole('button', { name: 'Retry same entry' }).click()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1]).toEqual(requests[0])
  expect(requests[0].feedback).toMatchObject({ sessionRpe: 7.5, pain: 'none', energy: null })
  expect(unexpected).toEqual([])
})

for (const feedbackV2 of [false, true]) test(`recommendation origin preserves session writer compatibility: v2=${feedbackV2}`, async ({ page }) => {
  const { context, unexpected } = await setup(page)
  context.capabilities.feedbackV2 = feedbackV2
  const recommendationId = '77777777-7777-4777-8777-777777777777'
  const requests: any[] = []
  await page.route(`${origin}/api/coach/sessions/${sessionId}/complete`, route => {
    requests.push(route.request().postDataJSON())
    context.activeProgram.upcomingSessions[0].status = 'skipped'
    return json(route, { result: { prescribed_session_id: sessionId, checkin_id: '55555555-5555-4555-8555-555555555555', workout_id: null }, context })
  })
  await page.goto(`/program?recommendationId=${recommendationId}`)
  await page.getByRole('button', { name: 'Finish or skip session' }).click()
  await page.getByRole('button', { name: 'Skipped', exact: true }).click()
  await page.getByRole('button', { name: 'Save skipped session', exact: true }).click()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0].recommendationId).toBe(feedbackV2 ? recommendationId : undefined)
  await expect(page.getByText('Skipped session saved as review evidence.', { exact: true })).toBeVisible()
  expect(unexpected).toEqual([])
})
