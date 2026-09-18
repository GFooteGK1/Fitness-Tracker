import { expect, test, type Page, type Route } from '@playwright/test'
const origin = 'http://127.0.0.1:3010'
const owner = '99999999-9999-4999-8999-999999999999'
const decisionId = '11111111-1111-4111-8111-111111111111'
const mealId = '66666666-6666-4666-8666-666666666666'
const now = '2026-09-18T15:00:00Z'
const email = 'coaching-ui@test.invalid'
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: owner, aud: 'authenticated', role: 'authenticated', email, exp: 4102444800 })).toString('base64url'), 'signature'].join('.')
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
const decision = { schemaVersion: 1, kind: 'action', ruleId: 'logged_nutrition.remaining', ruleVersion: '1', policyVersion: 'bounded-actions-1', runtimeFingerprint: 'fixture', scopeKey: 'nutrition:2026-09-18', evidenceFingerprint: 'logged-facts', sourceRevision: 2, responseRevision: 0, localDate: '2026-09-18', tzOffset: 300, validUntil: '2026-09-19T04:59:59Z', planVersionId: null, intentMemoryId: null, intentVersion: null, goalId: null, title: 'Review today’s logged nutrition', reason: '40 g protein is logged against your 150 g target (110 g remaining in the log). 500 calories are logged against your 2000 calorie target (1500 remaining in the log). Some amounts are estimates. Logging coverage is unknown. This does not establish your total intake or a fueling deficit.', reasonCodes: ['explicit_target', 'logged_amount_only', 'estimated_amounts'], missing: ['logging_coverage'], conflicts: [], destination: { type: 'nutrition', href: '/food-progress?view=camera&input=recent' }, sources: [{ table: 'daily_targets', id: owner, at: now, revision: null, facts: { protein: 150, calories: 2000 } }, { table: 'meals', id: mealId, at: now, revision: 1, facts: { protein: 40, calories: 500, estimated: true } }], outcome: null }
const row = { id: decisionId, decision, lifecycle: 'active', created_at: now }
type State = { dismissed: boolean; unavailable: boolean; loseResponse: boolean; responses: any[]; shown: any[]; coverage: any[]; refreshes: number; logs: any[]; unexpected: string[] }
async function setup(page: Page): Promise<State> {
  const state: State = { dismissed: false, unavailable: false, loseResponse: false, responses: [], shown: [], coverage: [], refreshes: 0, logs: [], unexpected: [] }
  await page.clock.install({ time: new Date(now) })
  await page.context().addCookies([{ name: 'sb-placeholder-auth-token', value: encodeURIComponent(JSON.stringify([token, 'local-refresh-token', null, null, null])), url: origin, sameSite: 'Lax' }])
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue()
    if (url.origin === 'https://placeholder.supabase.co') {
      if (url.pathname === '/auth/v1/user') return json(route, { id: owner, aud: 'authenticated', role: 'authenticated', email })
      if (url.pathname === '/rest/v1/user_profiles') return json(route, { user_id: owner, fitness_goals: ['Strength'], activity_level: 'moderately_active', body_metrics: { age: 40, weight_kg: 85, height_cm: 180 }, preferences: { units: 'imperial' }, medical_conditions: [] })
      if (['/rest/v1/chat_messages', '/rest/v1/fitness_insights'].includes(url.pathname)) return json(route, [])
    }
    if (url.origin === origin) {
      if (url.pathname === '/api/recommendations/refresh') {
        state.refreshes++
        expect(url.searchParams.get('expectedUserId')).toBe(owner); expect(url.searchParams.get('tzOffset')).toBe('300')
        if (state.unavailable) return json(route, { status: 'unavailable', recommendations: [], refreshState: null }, 503)
        return json(route, { status: 'ready', recommendations: state.dismissed ? [{ ...row, id: '22222222-2222-4222-8222-222222222222', decision: { ...decision, kind: 'abstain', title: 'No eligible next action', reason: 'No eligible next action is available from your current records.', destination: null } }] : [row], refreshState: { sourceRevision: 2, responseRevision: state.dismissed ? 1 : 0, pending: false }, coverage: state.coverage.at(-1) ? { id: 'coverage', coverage_through: state.coverage.at(-1).coverageThrough, status: state.coverage.at(-1).status, coverageValid: true } : null, outcomes: [{ id: 'followup', recommendationId: 'past', title: 'Earlier baseline check', lifecycle: 'superseded', payload: { adherence: 'observed', summary: 'A prior result was recorded.', attributionLimits: ['These records do not establish that advice caused a benefit.'] }, invalidated: true, createdAt: now }] })
      }
      if (/\/api\/recommendations\/[^/]+\/shown$/.test(url.pathname)) { state.shown.push(route.request().postDataJSON()); return json(route, { event: 'shown' }) }
      if (url.pathname === `/api/recommendations/${decisionId}/response`) {
        const body = route.request().postDataJSON(); state.responses.push(body); state.dismissed = true
        if (state.loseResponse && state.responses.length === 1) return route.abort('connectionfailed')
        return json(route, { event: 'response' })
      }
      if (url.pathname === '/api/recommendations/coverage') { state.coverage.push(route.request().postDataJSON()); return json(route, { coverage: 'saved' }) }
      if (url.pathname === '/api/capture/drafts') return json(route, { userId: owner, drafts: [] })
      if (url.pathname === '/api/coach') return json(route, { context: { userId: owner, storageAvailable: true, activeProgram: null, memories: [], assessments: [] } })
      if (url.pathname === '/api/dashboard-narrative') return json(route, { enabled: false })
      if (url.pathname === '/api/whoop/data') return json(route, { recovery: null })
      if (url.pathname === '/api/whoop/sync') return json(route, { isConnected: false })
      if (url.pathname === '/api/whoop/initialize') return json(route, { initialized: false })
      if (url.pathname === '/api/meals/daily') return json(route, { meals: [], dailyTotals: { protein: 0, carbs: 0, fat: 0, calories: 0 }, adherence: { overallScore: 0 } })
      if (url.pathname === '/api/targets') return json(route, { targetProtein: 150, targetCarbs: 200, targetFat: 65, targetCalories: 2000 })
      if (url.pathname === '/api/meals/common') return json(route, { meals: [{ sourceMealId: mealId, signature: 'eggs', title: 'Eggs', totals: { calories: 140, protein: 12 }, timesLogged: 2 }] })
      if (url.pathname === '/api/meals/quick-log') {
        state.logs.push(route.request().postDataJSON())
        return json(route, { mealId, receipt: { schemaVersion: 2, state: 'saved', entityKind: 'meal', entityId: mealId, userId: owner, revision: 1, requestId: state.logs.at(-1).requestId, recommendationId: state.logs.at(-1).recommendationId, inputMethod: 'template', capturedAt: now, eventAt: now, provenance: { occurrence: { origin: 'athlete_reported' }, fields: {} } } })
      }
    }
    state.unexpected.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  return state
}

for (const colorScheme of ['light', 'dark'] as const) test(`one action is usable at 320/390/desktop in ${colorScheme}`, async ({ page }) => {
  const state = await setup(page)
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
  await page.goto('/dashboard')
  const card = page.getByRole('region', { name: 'Next action', exact: true })
  await expect(card.getByRole('heading', { name: decision.title })).toBeVisible()
  await expect(card).toHaveAttribute('data-recommendation-id', decisionId)
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    for (const button of await card.getByRole('button').all()) expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: `output/playwright/personalized-coaching/next-action-${colorScheme}-${width}.png`, fullPage: true })
  }
  await card.getByText('Why this action?', { exact: true }).focus(); await page.keyboard.press('Enter')
  await expect(card.getByText('Saved nutrition targets', { exact: false })).toBeVisible()
  await card.getByText('Meal logging coverage', { exact: true }).click()
  await expect(card.getByRole('combobox', { name: 'Coverage' })).toHaveCSS('font-size', '16px')
  await card.getByRole('combobox', { name: 'Coverage' }).selectOption('partial')
  await card.getByRole('button', { name: 'Save coverage report' }).click()
  await expect.poll(() => state.coverage.length).toBe(1)
  expect(state.coverage[0]).toMatchObject({ domain: 'nutrition', status: 'partial', expectedUserId: owner, expectedSourceRevision: 2 })
  await page.goto('/v2')
  await expect(card).toHaveAttribute('data-recommendation-id', decisionId)
  await card.getByText('Recent follow-up', { exact: true }).click()
  await expect(card.getByText('Unknown · source records changed')).toBeVisible()
  await card.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(card.getByText('Done recorded as your report. No meal or workout was logged.')).toBeVisible()
  expect(state.responses).toHaveLength(1); expect(state.logs).toHaveLength(0)
  await page.reload()
  await expect(card.getByRole('heading', { name: 'No eligible next action' })).toBeVisible()
  expect(state.unexpected).toEqual([])
})

test('lost response remains recoverable after action suppression and reload', async ({ page }) => {
  const state = await setup(page); state.loseResponse = true
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Not applicable', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry same response' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Retry earlier response' }).click()
  await expect.poll(() => state.responses.length).toBe(2)
  expect(state.responses[1]).toEqual(state.responses[0]); expect(state.logs).toEqual([])
  expect(state.unexpected).toEqual([])
})

test('canonical meal origin is frozen and successful save survives unavailable next-action refresh', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/dashboard')
  await page.getByRole('link', { name: 'Open meal log', exact: true }).click()
  state.unavailable = true
  await page.getByRole('button', { name: 'Log Eggs', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Save receipt' }).getByText('Meal saved', { exact: true })).toBeVisible()
  expect(state.logs).toHaveLength(1); expect(state.logs[0]).toMatchObject({ recommendationId: decisionId, expectedUserId: owner })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Next action unavailable' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Next action', exact: true }).getByRole('link', { name: 'Your plan' })).toBeVisible()
  await page.screenshot({ path: 'output/playwright/personalized-coaching/next-action-unavailable.png', fullPage: true })
  expect(state.unexpected).toEqual([])
})
