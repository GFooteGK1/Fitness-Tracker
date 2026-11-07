import { expect, test, type Route } from '@playwright/test'
const origin = 'http://127.0.0.1:3010'
const owner = '99999999-9999-4999-8999-999999999999'
const email = 'target-browser@test.invalid'
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: owner, aud: 'authenticated', role: 'authenticated', email, exp: 4102444800 })).toString('base64url'), 'signature'].join('.')
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

test('unavailable targets retry safely on mobile and failed save preserves draft and Cancel', async ({ page }, info) => {
  let saved = { userId: owner, targetProtein: 150.25, targetCarbs: 200.5, targetFat: 60.75,
    targetCalories: 1949.8, tolerancePct: 0, updatedAt: '2026-11-02T12:00:00Z' }
  let phase: 'failed' | 'pending' | 'recovered' = 'failed'
  let pendingReads = 0
  const writes: any[] = []
  let releaseRetry!: () => void
  const retry = new Promise<void>(resolve => { releaseRetry = resolve })
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
        if (route.request().method() === 'GET') {
          if (phase === 'pending') {
            pendingReads++
            await retry
            return json(route, { error: 'Failed to fetch daily targets' }, 500)
          }
          return phase === 'failed' ? json(route, { error: 'Failed to fetch daily targets' }, 500) : json(route, saved)
        }
        expect(route.request().method()).toBe('POST')
        const body = route.request().postDataJSON(); writes.push(body)
        if (writes.length === 1) return json(route, { error: 'All target values must be positive numbers' }, 400)
        expect(body).toEqual({ targetProtein: 150.5, targetCarbs: 200.5, targetFat: 60.75, targetCalories: 1950.8, tolerancePct: 0 })
        saved = { ...saved, ...body }; return json(route, saved, 201)
      }
      if (url.pathname === '/api/meals/daily') return json(route, { meals: [], dailyTotals: { protein: 0, carbs: 0, fat: 0, calories: 0 }, adherence: { overallScore: 0 } })
      if (url.pathname === '/api/recommendations/refresh') return json(route, { status: 'disabled', recommendations: [], refreshState: null })
      if (url.pathname === '/api/capture/drafts') return json(route, { userId: owner, drafts: [] })
    }
    return route.abort('blockedbyclient')
  })
  await page.goto('/food-progress?view=targets')
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to load your daily targets' }))
    .toHaveText('Unable to load your daily targets. Please try again.')
  await expect(page.getByRole('heading', { name: 'No Targets Set' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Set Targets', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible()
  await page.setViewportSize({ width: 320, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  expect((await page.getByRole('button', { name: 'Try Again' }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: info.outputPath('target-read-unavailable.png'), fullPage: true })
  phase = 'pending'
  await page.getByRole('button', { name: 'Try Again' }).click()
  await expect.poll(() => pendingReads).toBe(1)
  await expect(page.getByRole('button', { name: 'Try Again' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'No Targets Set' })).toHaveCount(0)
  expect(writes).toHaveLength(0)
  releaseRetry()
  phase = 'recovered'
  await page.getByRole('button', { name: 'Try Again' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByPlaceholder('150', { exact: true })).toHaveValue('150.25')
  await page.getByPlaceholder('150', { exact: true }).fill('0')
  await page.getByRole('button', { name: 'Save Targets', exact: true }).click()
  await expect(page.getByText('All target values must be positive numbers')).toBeVisible()
  await expect(page.getByPlaceholder('150', { exact: true })).toHaveValue('0')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByPlaceholder('150', { exact: true })).toHaveValue('150.25')
  await page.getByPlaceholder('150', { exact: true }).fill('150.5')
  await page.getByRole('button', { name: 'Save Targets', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Today so far' })).toBeVisible()
  expect(writes).toHaveLength(2)
  await page.goto('/food-progress?view=targets')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByPlaceholder('150', { exact: true })).toHaveValue('150.5')
})
