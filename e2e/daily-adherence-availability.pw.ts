import { expect, test, type Route } from '@playwright/test'
const origin = 'http://127.0.0.1:3010'
const owner = '99999999-9999-4999-8999-999999999999'
const email = 'availability-browser@test.invalid'
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: owner, aud: 'authenticated', role: 'authenticated', email, exp: 4102444800 })).toString('base64url'), 'signature'].join('.')
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

test('daily comparison is unavailable despite target success and recovers through read-only negotiation', async ({ page }, info) => {
  const target = { userId: owner, targetProtein: 150.25, targetCarbs: 200.5, targetFat: 60.75, targetCalories: 1949.8, tolerancePct: 0 }
  const totals = { protein: 12.25, carbs: 0, fat: 3.75, calories: 82.75 }
  const meal = { id: '33333333-3333-4333-8333-333333333333', userId: owner, captureRevision: 7,
    mealTimestamp: '2026-11-02T12:00:00Z', items: [{ food: 'Synthetic eggs', portion: '2 eggs', ...totals }],
    totalProtein: totals.protein, totalCarbs: totals.carbs, totalFat: totals.fat, totalCalories: totals.calories, needsReview: false, manualOverride: true }
  const facts = { meals: [meal], dailyTotals: totals }
  const score = { proteinAdherence: 50, carbsAdherence: 50, fatAdherence: 50, caloriesAdherence: 50, overallScore: 50, withinTolerance: false }
  let mode: 'unavailable' | 'pending' | 'legacy' | 'available' = 'unavailable'
  let targetReads = 0
  const dailyReads = { unavailable: 0, pending: 0, legacy: 0, available: 0 }
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const unexpected: string[] = []
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
        expect(route.request().method()).toBe('GET'); targetReads++
        return json(route, target)
      }
      if (url.pathname === '/api/meals/daily') {
        expect(route.request().method()).toBe('GET')
        expect(url.searchParams.getAll('availability')).toEqual(['explicit']); dailyReads[mode]++
        if (mode === 'pending') { await pending; return json(route, { error: 'Synthetic meal read unavailable' }, 500) }
        if (mode === 'unavailable') return json(route, { ...facts, adherenceAvailability: 'unavailable', adherence: null })
        if (mode === 'legacy') return json(route, { ...facts, adherence: { ...score, overallScore: 87 } })
        const next = { protein: 75.125, carbs: 100.25, fat: 30.375, calories: 974.9 }
        return json(route, { meals: [{ ...meal, captureRevision: 8, items: [{ food: 'Synthetic half-target meal', portion: '1 serving', ...next }],
          totalProtein: next.protein, totalCarbs: next.carbs, totalFat: next.fat, totalCalories: next.calories }],
          dailyTotals: next, adherenceAvailability: 'available', adherence: score })
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
  await expect(summary.getByRole('alert')).toHaveText('Target comparison is temporarily unavailable. Please try again.')
  await expect.poll(() => targetReads).toBeGreaterThan(0)
  await expect(summary.getByText('12.3g', { exact: true })).toBeVisible()
  await expect(summary.getByText('No Daily Targets Set')).toHaveCount(0)
  await expect(summary.getByText('Target comparison', { exact: true })).toHaveCount(0)
  await expect(summary.getByText(/% adherence/)).toHaveCount(0)
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    expect((await page.getByRole('button', { name: 'Retry comparison' }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: info.outputPath('comparison-unavailable-' + width + '.png'), fullPage: true })
  }
  mode = 'pending'
  await page.getByRole('button', { name: 'Retry comparison' }).click()
  await expect(page.getByRole('button', { name: 'Retry comparison' })).toBeDisabled()
  await expect(summary.getByText('12.3g', { exact: true })).toBeVisible()
  release()
  await expect(summary.getByRole('alert')).toHaveText('Target comparison is temporarily unavailable. Please try again.')
  await expect(summary.getByText('12.3g', { exact: true })).toBeVisible()
  mode = 'legacy'
  await page.getByRole('button', { name: 'Retry comparison' }).click()
  await expect(summary.getByRole('alert')).toHaveText('Target comparison could not be verified. Please try again.')
  await expect(summary.getByText(/87%/)).toHaveCount(0)
  mode = 'available'
  await page.getByRole('button', { name: 'Retry comparison' }).click()
  await expect(summary.getByText('75.1g', { exact: true })).toBeVisible()
  await summary.getByText('Target comparison', { exact: true }).click()
  await expect(summary.getByText(/50% adherence for logged meals only/)).toBeVisible()
  await expect(summary.getByText('12.3g', { exact: true })).toHaveCount(0)
  // Development authentication/mount effects may repeat the initial read.
  // Each deliberate retry still has exactly one negotiated GET.
  expect(dailyReads.unavailable).toBeGreaterThan(0)
  expect(dailyReads).toMatchObject({ pending: 1, legacy: 1, available: 1 })
  expect(unexpected).toEqual([])
})
