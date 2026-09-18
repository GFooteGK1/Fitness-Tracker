import { expect, test, type Page, type Route } from '@playwright/test'

// These browser tests exercise the real Next/React UI and browser storage.
// Authentication, accepted plan data, and save receipts are explicit simulations;
// executable database tests own the server transaction/replay guarantees.
const origin = 'http://127.0.0.1:3010'
const userId = '99999999-9999-4999-8999-999999999999'
const savedWorkoutId = '33333333-3333-4333-8333-333333333333'
const savedMealId = '66666666-6666-4666-8666-666666666666'
const email = 'local-browser@test.invalid'
const token = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', email, exp: 4102444800 })).toString('base64url'),
  'signature'
].join('.')

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Progress layout: summary, details and empty states in ${colorScheme}`, async ({ page }) => {
    const unexpected = await signedInCoach(page)
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    let empty = false
    let recordsFailed = false
    await page.route(`${origin}/api/dashboard-stats**`, route => json(route, { totalWorkouts: empty ? 0 : 48, monthToDate: empty ? 0 : 9, strengthSessions: 30, metcons: 20, cardio: 12, currentMonth: 'September 2026' }))
    await page.route(`${origin}/api/pr-history**`, route => recordsFailed ? json(route, {}, 500) : json(route, { records: empty ? [] : [{ id: 'record-1', exercise: 'Back squat', pr_type: 'weight', value: 225, previous_value: 215, achieved_at: '2026-09-03T15:00:00Z' }], summary: { thisMonth: empty ? 0 : 1 } }))
    await page.route(`${origin}/api/whoop/data**`, route => json(route, empty ? { connectionStatus: 'disconnected' } : { connectionStatus: 'connected', lastSyncAt: null, recovery: { recovery_score: 70, hrv_rmssd_milli: 56.3 }, sleep: { sleep_performance_percentage: 82, sleep_efficiency_percentage: 91 }, cycle: { strain: 12.4 } }))
    await page.goto('/progress')
    await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible()
    await expect(page.getByText('225 lbs', { exact: true })).toBeVisible()
    await page.getByText('Recovery details', { exact: true }).click()
    await expect(page.getByText('56 ms', { exact: true })).toBeVisible()
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
      await page.screenshot({ path: `output/playwright/app-quality-results/progress-${colorScheme}-${width}.png`, fullPage: true })
    }
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Export Data' })).toBeVisible()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    recordsFailed = true
    await page.reload()
    await page.getByRole('button', { name: 'Retry records' }).waitFor()
    await expect(page.getByText('48', { exact: true })).toBeVisible()
    recordsFailed = false
    await page.getByRole('button', { name: 'Retry records' }).click()
    await expect(page.getByText('225 lbs', { exact: true })).toBeVisible()
    empty = true
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await expect(page.getByRole('link', { name: 'Log a workout', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Connect WHOOP' })).toBeVisible()
    await expect(page.getByText('Your first results establish a baseline.', { exact: false })).toBeVisible()
    await page.screenshot({ path: `output/playwright/app-quality-results/progress-empty-${colorScheme}.png`, fullPage: true })
    expect(unexpected).toEqual([])
  })
}

// Theme checks use the actual rendered controls, including compact icon actions.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`UI consistency: auth and notices in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.route('https://placeholder.supabase.co/**', route => json(route, { message: 'Invalid login credentials', error: 'invalid_grant' }, 400))
    await page.goto('/auth/signin')
    await page.getByLabel('Email Address').fill('visual@test.invalid')
    await page.getByLabel('Password', { exact: true }).fill('simulated-password')
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid email or password' })).toBeVisible()
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      const button = page.getByRole('button', { name: 'Sign In', exact: true })
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await expect(button).toHaveCSS('background-color', colorScheme === 'light' ? 'rgb(33, 107, 85)' : 'rgb(132, 219, 194)')
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
      await page.screenshot({ path: `output/playwright/app-quality-results/auth-${colorScheme}-${width}.png`, fullPage: true })
    }
  })

  test(`UI consistency: program selection and install banner in ${colorScheme}`, async ({ page }) => {
    await signedInCoach(page)
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.route(`${origin}/api/coach`, route => json(route, { context: {
      generatedAt: '2026-09-04T15:00:00Z', storageAvailable: true,
      doctrineVersion: '0.1.0', policyVersion: '0.1.0', assessments: [], memories: [], activeProgram: null
    } }))
    await page.route(`${origin}/api/coach/weekly`, route => json(route, { mode: 'rolling_weekly', program: null, currentWeek: null, history: [] }))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/program')
    await expect(page.getByRole('heading', { name: 'Set your training direction' })).toBeVisible()
    const monday = page.getByLabel('Monday', { exact: true })
    // The accessible checkbox is visually hidden; the visible label is its touch target.
    await monday.locator('..').click()
    await expect(monday).toBeChecked()
    await expect(monday.locator('..')).toHaveCSS('background-color', colorScheme === 'light' ? 'rgb(33, 107, 85)' : 'rgb(132, 219, 194)')
    await page.screenshot({ path: `output/playwright/app-quality-results/program-${colorScheme}.png`, fullPage: true })
    await page.goto('/coach')
    await expect(page.getByLabel('Message input')).toBeEnabled()
    for (const label of ['Photo input', 'Voice input']) {
      const control = page.getByRole('button', { name: label, exact: true })
      expect((await control.boundingBox())!.width).toBeGreaterThanOrEqual(44)
      expect((await control.locator('svg').boundingBox())!.width).toBeGreaterThanOrEqual(16)
    }
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) })
      window.dispatchEvent(event)
    })
    await expect(page.getByText('Install SociusFit', { exact: true })).toBeVisible()
    await expect.poll(async () => {
      const banner = await page.getByRole('button', { name: 'Install', exact: true }).boundingBox()
      const nav = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox()
      return banner!.y + banner!.height < nav!.y
    }).toBe(true)
    await page.screenshot({ path: `output/playwright/app-quality-results/install-${colorScheme}.png` })
    await page.getByRole('button', { name: 'Not now', exact: true }).click()
    await expect(page.getByText('Install SociusFit', { exact: true })).toHaveCount(0)
  })
}

async function signedInCoach(page: Page) {
  const unexpected: string[] = []
  // Keep dates reproducible without freezing browser timers or request deadlines.
  await page.clock.setFixedTime(new Date('2026-09-04T15:00:00Z'))
  await page.context().addCookies([{
    name: 'sb-placeholder-auth-token',
    value: encodeURIComponent(JSON.stringify([token, 'local-refresh-token', null, null, null])),
    url: origin,
    sameSite: 'Lax'
  }])
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue()
    if (url.origin === 'https://placeholder.supabase.co') {
      if (url.pathname === '/auth/v1/user') return json(route, { id: userId, aud: 'authenticated', role: 'authenticated', email })
      if (url.pathname === '/rest/v1/user_profiles') return json(route, {
        user_id: userId,
        fitness_goals: ['Build repeatable strength'],
        activity_level: 'moderately_active',
        body_metrics: { height_cm: 180, weight_kg: 85, age: 40 },
        preferences: { units: 'imperial', notifications: true, privacy_level: 'private' },
        medical_conditions: [],
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'
      })
      if (url.pathname === '/rest/v1/chat_messages') return json(route, [])
    }
    if (url.origin === origin) {
      if (url.pathname === '/api/recommendations/refresh') return json(route, { status: 'disabled', recommendations: [], refreshState: null })
      if (url.pathname === '/api/capture/drafts') return json(route, { userId, drafts: [] })
      if (url.pathname === '/api/coach/intent') return json(route, { enabled: false, snapshot: null, baselineCandidates: [] })
      if (url.pathname === '/api/coach/trust') return json(route, { trust: { available: true, memories: [], imports: [], goals: [], qualities: [], signalSummary: [], proposals: [] }, exercisePreferencesEnabled: false })
      if (url.pathname === '/api/whoop/sync' && route.request().method() === 'GET') return json(route, { isConnected: true, lastSyncAt: '2026-09-04T15:00:00Z', status: 'idle' })
      if (url.pathname === '/api/whoop/initialize') return json(route, { initialized: false })
      if (url.pathname === '/api/whoop/data') return json(route, { recovery: null })
      if (url.pathname === '/api/meals/daily') return json(route, { dailyTotals: { protein: 0, carbs: 0, fat: 0, calories: 0 } })
      if (url.pathname === '/api/targets') return json(route, { targetProtein: 150, targetCarbs: 200, targetFat: 65, targetCalories: 2000 })
      if (url.pathname === '/api/coach') return json(route, { context: {
        storageAvailable: true,
        activeProgram: { upcomingSessions: [
          { id: 'session-today', scheduledDate: '2026-09-04', status: 'planned', prescription: { title: 'Accepted strength session', intent: 'Build repeatable squat strength.' } },
          { id: 'session-tomorrow', scheduledDate: '2026-09-05', status: 'planned', prescription: { title: 'Tomorrow only session' } }
        ] }
      } })
    }
    unexpected.push(route.request().method() + ' ' + url.href)
    // Fail closed: never fall through to an actual external service or API write.
    return route.abort('blockedbyclient')
  })
  return unexpected
}

async function openCoach(page: Page) {
  await page.goto('/coach')
  await expect(page.getByRole('heading', { name: 'Coach', exact: true })).toBeVisible()
  await expect(page.getByLabel('Message input')).toBeEnabled()
  await page.getByText("Today's context", { exact: true }).click()
  await expect(page.getByText('Accepted strength session', { exact: false })).toBeVisible()
}

test('Coach displays the accepted session and links to the canonical Program screen', async ({ page }) => {
  const unexpected = await signedInCoach(page)
  await openCoach(page)
  await expect(page.getByText('Tomorrow only session', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Build repeatable squat strength.', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Program', exact: true })).toHaveAttribute('href', '/program')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  expect(unexpected).toEqual([])
  await page.screenshot({ path: 'output/playwright/app-quality-results/coach-mobile.png', fullPage: true })
})

test('text response loss then reload retries the original request and one simulated save', async ({ page }) => {
  const unexpected = await signedInCoach(page)
  const bodies: Array<{ requestId: string; submittedAt: string; content: string }> = []
  const saved = new Map<string, unknown>()
  await page.route(`${origin}/api/agent/process`, async route => {
    const body = route.request().postDataJSON()
    bodies.push(body)
    if (!saved.has(body.requestId)) saved.set(body.requestId, {
      messages: [{ role: 'trainer', domain: 'trainer', content: 'Workout saved once.', related_entity_id: savedWorkoutId, related_entity_type: 'workout' }],
      processing_time_ms: 1, requestStatus: 'complete'
    })
    if (bodies.length === 1) return route.abort('connectionfailed')
    return json(route, saved.get(body.requestId))
  })
  await openCoach(page)
  const text = 'Log four sets of five back squats at 185 lb.'
  await page.getByLabel('Message input').fill(text)
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect.poll(() => bodies.length).toBe(1)
  await expect(page.getByLabel('Message input')).toBeEnabled()
  await expect(page.getByLabel('Message input')).toHaveValue(text)
  await page.reload()
  await expect(page.getByLabel('Message input')).toBeEnabled()
  await page.getByLabel('Message input').fill(text)
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByRole('log', { name: 'Conversation' }).getByText('Workout saved once.', { exact: true })).toBeVisible()
  expect(bodies).toHaveLength(2)
  expect(bodies[0].requestId).toMatch(/^[0-9a-f-]{36}$/)
  expect(bodies[1]).toEqual(bodies[0])
  expect(saved.size).toBe(1)
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('socius-pending:')))).toEqual([])
  expect(unexpected).toEqual([])
})

function multipartField(body: string, name: string) {
  const marker = `name="${name}"\r\n\r\n`
  const start = body.indexOf(marker)
  if (start < 0) throw new Error(`Missing multipart field: ${name}`)
  return body.slice(start + marker.length).split('\r\n')[0]
}

test('meal photo response loss survives reload with the same request and capture time', async ({ page }) => {
  const unexpected = await signedInCoach(page)
  const submissions: Array<{ requestId: string; timestamp: string }> = []
  const saved = new Map<string, unknown>()
  await page.route(`${origin}/api/meals/upload`, async route => {
    const body = route.request().postDataBuffer()!.toString('latin1')
    const submission = { requestId: multipartField(body, 'requestId'), timestamp: multipartField(body, 'timestamp') }
    submissions.push(submission)
    if (!saved.has(submission.requestId)) saved.set(submission.requestId, {
      mealId: savedMealId, analysisStatus: 'complete',
      analysis: { notes: 'Meal saved once.', total_protein: 30, total_carbs: 40, total_fat: 10, total_calories: 370 }
    })
    if (submissions.length === 1) return route.abort('connectionfailed')
    return json(route, saved.get(submission.requestId))
  })
  await openCoach(page)
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 96
    const ctx = canvas.getContext('2d')!
    const image = ctx.createImageData(96, 96)
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = (i * 13) % 251
      image.data[i + 1] = (i * 7) % 241
      image.data[i + 2] = (i * 19) % 239
      image.data[i + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const photo = { name: 'test-meal.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') }
  await page.locator('input[type=file]').first().setInputFiles(photo)
  await expect.poll(() => submissions.length).toBe(1)
  await expect(page.getByRole('button', { name: 'Photo input', exact: true })).toBeEnabled()
  await page.reload()
  await expect(page.getByLabel('Message input')).toBeEnabled()
  await page.clock.setFixedTime(new Date('2026-09-04T15:05:00Z'))
  await page.locator('input[type=file]').first().setInputFiles(photo)
  await expect(page.getByRole('log', { name: 'Conversation' }).getByText('Meal saved once.', { exact: false })).toBeVisible()
  expect(submissions).toHaveLength(2)
  expect(submissions[0].requestId).toMatch(/^[0-9a-f-]{36}$/)
  expect(submissions[1]).toEqual(submissions[0])
  expect(saved.size).toBe(1)
  expect(unexpected).toEqual([])
})


test('low-touch screens preserve navigation, empty-state meaning, and draft preferences', async ({ page }) => {
  const unexpected = await signedInCoach(page)
  await page.route(`${origin}/api/meals/daily**`, route => json(route, {
    meals: [], dailyTotals: { protein: 0, carbs: 0, fat: 0, calories: 0 },
    adherence: { overallScore: 0, withinTolerance: false, proteinAdherence: 0, carbsAdherence: 0, fatAdherence: 0, caloriesAdherence: 0 }
  }))
  await page.route(`${origin}/api/templates**`, route => json(route, { templates: [] }))
  await page.route(`${origin}/api/whoop/data**`, route => json(route, { connectionStatus: 'disconnected', recovery: null }))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/coach')
  await expect(page.getByRole('heading', { name: 'What would help today?' })).toBeVisible()
  await page.getByRole('button', { name: 'Explain my recovery', exact: true }).click()
  await expect(page.getByLabel('Message input')).toHaveValue('Explain my recovery')
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible()
    const composer = await page.getByLabel('Message input').boundingBox()
    const nav = await page.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox()
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(nav!.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.screenshot({ path: `output/playwright/app-quality-results/coach-${width}.png` })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/log')
  await expect(page.getByLabel('Workout details', { exact: false })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible()
  await page.screenshot({ path: 'output/playwright/app-quality-results/log-new.png' })
  await page.goto('/food-progress')
  await expect(page.getByText('No meals logged yet', { exact: false })).toBeVisible()
  await expect(page.getByText('Outside target range')).toHaveCount(0)
  await page.screenshot({ path: 'output/playwright/app-quality-results/nutrition-new.png' })
  await page.goto('/templates')
  await expect(page.getByRole('heading', { name: 'Workout Templates' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible()
  await page.screenshot({ path: 'output/playwright/app-quality-results/templates-new.png' })
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'Profile' , exact: true })).toBeVisible()
  await page.screenshot({ path: 'output/playwright/app-quality-results/profile-new.png' })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.screenshot({ path: 'output/playwright/app-quality-results/profile-light.png' })
  expect(unexpected).toEqual([])
})

test('photo portion correction preserves the draft and retries the same totals', async ({ page }) => {
  const unexpected = await signedInCoach(page)
  await page.route(`${origin}/api/meals/daily**`, route => json(route, {
    meals: [], dailyTotals: { protein: 0, carbs: 0, fat: 0, calories: 0 },
    adherence: { overallScore: 0, withinTolerance: false, proteinAdherence: 0, carbsAdherence: 0, fatAdherence: 0, caloriesAdherence: 0 }
  }))
  const updates: unknown[] = []
  await page.route(`${origin}/api/meals/upload`, route => json(route, {
    mealId: savedMealId, analysisStatus: 'complete', analysis: {
      items: [{ food: 'Rice', portion: '1 cup', protein: 4, carbs: 40, fat: 2, calories: 194 }],
      total_protein: 4, total_carbs: 40, total_fat: 2, total_calories: 194
    }
  }))
  await page.route(`${origin}/api/meals/${savedMealId}`, route => {
    if (route.request().method() === 'GET') return json(route, { meal: { id: savedMealId, userId, captureRevision: 1 } })
    updates.push(route.request().postDataJSON())
    return json(route, updates.length === 1 ? { error: 'Unavailable' } : {}, updates.length === 1 ? 500 : 200)
  })
  await page.goto('/food-progress?view=camera&input=photo')
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96
    const context = canvas.getContext('2d')!; context.fillStyle = '#aabbcc'; context.fillRect(0, 0, 96, 96)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.locator('input[type=file]').first().setInputFiles({ name: 'test-meal.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })
  await page.getByRole('button', { name: 'Analyze Photo', exact: true }).click()
  await expect(page.getByText('Review the estimate', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Half', exact: true }).click()
  await page.getByRole('button', { name: 'Apply corrections', exact: true }).click()
  await expect(page.getByText('Changes could not be fully saved.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Half', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: 'output/playwright/app-quality-results/portion-retry.png', fullPage: true })
  await page.getByRole('button', { name: 'Apply corrections', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Nutrition', exact: true })).toBeVisible()
  expect(updates).toHaveLength(2)
  expect(updates[1]).toEqual(updates[0])
  expect(updates[1]).toMatchObject({ expectedRevision: 1, expectedUserId: userId, manualOverride: true,
    items: [expect.objectContaining({ calories: 97, protein: 2, carbs: 20, fat: 1 })] })
  expect(unexpected).toEqual([])
})
