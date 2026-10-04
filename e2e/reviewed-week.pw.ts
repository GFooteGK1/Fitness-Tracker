import { test, expect, type Route } from '@playwright/test'
import { reviewedRollingWeek } from '../test/fixtures/reviewed-rolling-week'

// Synthetic readback only. All remote/API requests intercepted; never accepts or writes a plan.
const origin = 'http://127.0.0.1:3010'
const owner = '99999999-9999-4999-8999-999999999999', email = 'reviewed-week@test.invalid'
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: owner, aud: 'authenticated', role: 'authenticated', email, exp: 4102444800 })).toString('base64url'), 'signature'].join('.')
const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

for (const scenario of [{ width: 320, colorScheme: 'light' }, { width: 390, colorScheme: 'dark' }, { width: 1280, colorScheme: 'light' }] as const) {
  test(`lossless reviewed week at ${scenario.width} ${scenario.colorScheme}`, async ({ page }, testInfo) => {
    const { plan, intent } = reviewedRollingWeek()
    const current = { id: 'reviewed-plan', status: 'accepted', window_start: plan.windowStart, window_end: plan.windowEnd, sequence_number: 1, intent }
    const unexpected: string[] = [], errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width: scenario.width, height: 844 })
    await page.emulateMedia({ colorScheme: scenario.colorScheme })
    await page.clock.setFixedTime(new Date('2026-08-08T15:00:00Z'))
    await page.context().addCookies([{ name: 'sb-placeholder-auth-token', value: encodeURIComponent(JSON.stringify([token, 'local-refresh-token', null, null, null])), url: origin, sameSite: 'Lax' }])
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()), method = route.request().method()
      if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue()
      if (url.origin === 'https://placeholder.supabase.co') {
        if (url.pathname === '/auth/v1/user') return json(route, { id: owner, aud: 'authenticated', role: 'authenticated', email })
        if (url.pathname === '/rest/v1/user_profiles') return json(route, { user_id: owner, fitness_goals: ['Strength'], activity_level: 'moderately_active', body_metrics: { age: 40, weight_kg: 85, height_cm: 180 }, preferences: { units: 'imperial' }, medical_conditions: [] })
      }
      if (url.origin === origin) {
        if (url.pathname === '/api/whoop/initialize') return json(route, { initialized: false })
        if (url.pathname === '/api/whoop/sync') return json(route, { isConnected: false })
        if (url.pathname === '/api/recommendations/refresh') return json(route, { status: 'disabled', recommendations: [], refreshState: null })
        if (method === 'GET') {
          if (url.pathname === '/api/coach') return json(route, { context: { userId: owner, storageAvailable: true, assessments: [], memories: [],
            activeProgram: { id: 'program-1', title: plan.title, activePlanVersionId: current.id, upcomingSessions: [], weeks: [], sessionCheckins: [] } } })
          if (url.pathname === '/api/coach/weekly') return json(route, { mode: 'rolling_weekly', program: { id: 'program-1', title: plan.title,
            direction: plan.directionSnapshot, goal_target_date: null, active_plan_version_id: current.id }, currentWeek: current, pendingProposal: null,
            history: { plans: [current], reviews: [] } })
          if (url.pathname === '/api/coach/intake') return json(route, { exercisePreferencesEnabled: false, exercisePreferences: null })
          if (url.pathname === '/api/coach/intent') return json(route, { enabled: false, snapshot: null, baselineCandidates: [] })
          if (url.pathname === '/api/coach/trust') return json(route, { trust: { available: true, memories: [], imports: [], goals: [], qualities: [], signalSummary: [], proposals: [] }, exercisePreferencesEnabled: false })
          if (url.pathname === '/api/capture/drafts') return json(route, { userId: owner, drafts: [] })
        }
      }
      unexpected.push(`${method} ${url.origin}${url.pathname}`)
      return route.abort()
    })
    await page.goto('/program')
    await expect(page.getByText('Estimated 67:09 · 75 minutes available')).toBeVisible()
    await expect(page.getByText('4 × 2 reps', { exact: true })).toBeVisible()
    await expect(page.getByText('3 × 6–8 reps', { exact: true })).toBeVisible()
    await expect(page.getByText('2 × 30 seconds per side; 15 seconds to switch sides', { exact: true })).toBeVisible()
    await expect(page.getByText('Target RPE no higher than 7', { exact: true })).toHaveCount(2)
    await expect(page.getByRole('button', { name: /Accept next week|Review this week|Save session/i })).toHaveCount(0)
    const guidance = page.getByText('Full session guidance', { exact: true }).first()
    await guidance.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('details[open]').first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const link = page.getByRole('link', { name: 'Open workout log' })
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: testInfo.outputPath('reviewed-week.png'), fullPage: true })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: testInfo.outputPath('reviewed-week-top.png') })
    expect(unexpected).toEqual([])
    expect(errors).toEqual([])
  })
}
