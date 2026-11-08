import { expect, test, type Route } from '@playwright/test'
const origin = 'http://127.0.0.1:3010'
const owner = '99999999-9999-4999-8999-999999999999'
const email = 'daily-browser@test.invalid'
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: owner, aud: 'authenticated', role: 'authenticated', email, exp: 4102444800 })).toString('base64url'), 'signature'].join('.')
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
function latch() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve }); return { promise, release } }

test('daily targets preserve mobile meal facts through retry, interruption and correction recovery', async ({ page }, info) => {
  const target = { userId: owner, targetProtein: 150.25, targetCarbs: 200.5, targetFat: 60.75, targetCalories: 1949.8, tolerancePct: 0 }
  let meal = { id: '33333333-3333-4333-8333-333333333333', userId: owner, captureRevision: 7,
    mealTimestamp: '2026-11-02T12:00:00Z', items: [{ food: 'Synthetic eggs', portion: '2 eggs', protein: 12.25, carbs: 0, fat: 3.75, calories: 82.75 }],
    totalProtein: 12.25, totalCarbs: 0, totalFat: 3.75, totalCalories: 82.75, needsReview: false, manualOverride: true }
  const daily = { meals: [meal], dailyTotals: { protein: 12.25, carbs: 0, fat: 3.75, calories: 82.75 },
    adherence: { overallScore: 4.5, withinTolerance: false } }
  let phase: 'initial' | 'retry' | 'success' | 'post-save' | 'interrupted' | 'latest' = 'initial'
  const initial = latch(), retry = latch(), postSave = latch(), interrupted = latch()
  let held = 0
  const corrections: any[] = [], targetWrites: string[] = [], unexpected: string[] = []
  await page.context().addCookies([{ name: 'sb-placeholder-auth-token',
    value: encodeURIComponent(JSON.stringify([token, 'local-refresh-token', null, null, null])), url: origin, sameSite: 'Lax' }])
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue()
    if (url.origin === 'https://placeholder.supabase.co') {
      if (url.pathname === '/auth/v1/user') return json(route, { id: owner, aud: 'authenticated', role: 'authenticated', email })
      if (url.pathname === '/rest/v1/user_profiles') return json(route, { user_id: owner, fitness_goals: ['Strength'],
        activity_level: 'moderately_active', body_metrics: { age: 40, weight_kg: 85, height_cm: 180 }, preferences: { units: 'imperial' }, medical_conditions: [] })
      return json(route, [])
    }
    if (url.origin === origin) {
      if (url.pathname === '/api/targets') {
        if (route.request().method() !== 'GET') { targetWrites.push(route.request().method()); return route.abort('blockedbyclient') }
        if (phase === 'initial') { await initial.promise; return json(route, { error: 'Targets unavailable' }, 500) }
        if (phase === 'retry') { await retry.promise; return json(route, { error: 'Targets unavailable' }, 500) }
        if (phase === 'post-save') { await postSave.promise; return json(route, target) }
        if (phase === 'interrupted') { held++; await interrupted.promise; return json(route, { ...target, targetProtein: 999 }) }
        return json(route, phase === 'latest' ? { ...target, targetProtein: 170.25 } : target)
      }
      if (url.pathname === '/api/meals/daily') return json(route, daily)
      if (url.pathname === '/api/meals/' + meal.id) {
        if (route.request().method() === 'GET') return json(route, { meal })
        expect(route.request().method()).toBe('PUT')
        corrections.push(route.request().postDataJSON())
        if (corrections.length === 1) return json(route, { error: 'Correction remains unconfirmed. Retry the unchanged correction.' }, 500)
        meal = { ...meal, items: corrections[1].items, captureRevision: 8 }
        daily.meals = [meal]
        phase = 'post-save'
        return json(route, { meal })
      }
      if (url.pathname === '/api/recommendations/refresh') return json(route, { status: 'disabled', recommendations: [], refreshState: null })
      if (url.pathname === '/api/capture/drafts') return json(route, { userId: owner, drafts: [] })
      if (url.pathname === '/api/whoop/initialize') return json(route, { initialized: false })
    }
    unexpected.push(url.origin + url.pathname)
    return route.abort('blockedbyclient')
  })
  await page.goto('/food-progress')
  const summary = page.getByRole('region', { name: 'Daily nutrition summary' })
  await expect(page.getByText('1 meal logged')).toBeVisible()
  for (const text of ['12.3g', '0g', '3.8g', '82.8']) await expect(summary.getByText(text, { exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Loading daily targets' })).toBeVisible()
  await expect(page.getByText('No Daily Targets Set')).toHaveCount(0)
  initial.release()
  await expect(page.getByRole('alert').filter({ hasText: 'Daily targets are temporarily unavailable' })).toBeVisible()
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    expect((await page.getByRole('button', { name: 'Retry Targets' }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: info.outputPath('daily-unavailable-' + width + '.png'), fullPage: true })
  }
  phase = 'retry'
  await page.getByRole('button', { name: 'Retry Targets' }).click()
  await expect(page.getByRole('button', { name: 'Retry Targets' })).toBeDisabled()
  await expect(summary.getByText('12.3g', { exact: true })).toBeVisible()
  retry.release()
  await expect(page.getByRole('alert').filter({ hasText: 'Daily targets are temporarily unavailable' })).toBeVisible()
  phase = 'success'
  await page.getByRole('button', { name: 'Retry Targets' }).click()
  await expect(summary.getByText('of 150.3g target')).toBeVisible()
  await summary.getByText('Target comparison', { exact: true }).click()
  await expect(summary.getByText(/5% adherence for logged meals only/)).toBeVisible()

  // Real card -> real modal -> unchanged correction helper contract, including failed-save recovery.
  await page.getByRole('button', { name: 'Edit meal' }).click()
  await page.getByPlaceholder('e.g., 6 oz, 1 cup, 150g').fill('3 eggs')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByText('Correction remains unconfirmed. Retry the unchanged correction.', { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('e.g., 6 oz, 1 cup, 150g')).toHaveValue('3 eggs')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(summary.getByRole('status').filter({ hasText: 'Loading daily targets' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Edit Meal' })).toHaveCount(0, { timeout: 2000 })
  expect(corrections).toHaveLength(2)
  expect(corrections[1]).toEqual(corrections[0])
  expect(corrections[0]).toMatchObject({ expectedRevision: 7, expectedUserId: owner, manualOverride: true })
  expect(corrections[0].requestId).toBeTruthy()
  phase = 'success'
  postSave.release()
  await expect(summary.getByText('of 150.3g target')).toBeVisible()

  phase = 'interrupted'
  await page.locator('input[type=date]').fill('2026-11-03')
  await expect.poll(() => held).toBeGreaterThan(0)
  await expect(summary.getByText('12.3g', { exact: true })).toBeVisible()
  await expect(summary.getByText('of 150.3g target')).toHaveCount(0)
  phase = 'latest'
  await page.locator('input[type=date]').fill('2026-11-04')
  await expect(summary.getByText('of 170.3g target')).toBeVisible()
  interrupted.release()
  await expect(summary.getByText('of 999g target')).toHaveCount(0)
  await expect(summary.getByText('of 170.3g target')).toBeVisible()
  expect(targetWrites).toEqual([])
  expect(unexpected).toEqual([])
})
