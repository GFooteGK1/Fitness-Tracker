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
