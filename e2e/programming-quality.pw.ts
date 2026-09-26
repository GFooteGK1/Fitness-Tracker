import { expect, test, type Page, type Route } from '@playwright/test'
import { buildProgrammingProfile } from '../app/lib/coach/complete-intake'
import { buildRollingTrainingDirection } from '../app/lib/coach/rolling-weekly-contracts'
import { buildRollingWeeklyPlan } from '../app/lib/coach/rolling-weekly-plan'
import { projectCoachingDecisionContext } from '../app/lib/coach/coaching-decision-context'
import { coachingDecisionRows } from '../test/fixtures/coaching-decision-record'

// Real browser UI, synthetic owned auth/API records. No hosted calls or coaching-quality claims.
const origin = 'http://127.0.0.1:3010', owner = '99999999-9999-4999-8999-999999999999'
const now = '2026-09-22T15:00:00.000Z', email = 'programming-mobile@test.invalid'
const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: owner, aud: 'authenticated', role: 'authenticated', email, exp: 4102444800 })).toString('base64url'), 'signature'].join('.')
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
const replacement = { format: 'complete_programming_intake_v0_3' as const, primaryDomain: 'strength' as const,
  goal: 'Build useful full-body strength', experience: 'consistent' as const, trainingDays: ['tuesday', 'thursday'] as ('tuesday' | 'thursday')[],
  sessionMinutes: 45, equipment: 'Bodyweight', resolvedEquipmentIds: ['bodyweight' as const], constraints: '', constraintKinds: [],
  secondaryGoals: [], startDate: '2026-09-21', setupConfirmed: false }
const profile = buildProgrammingProfile({ ...replacement, startDate: '2026-09-14', trainingDays: ['monday', 'wednesday', 'friday'], sessionMinutes: 60 }, [])
const direction = buildRollingTrainingDirection(profile, { hypothesis: 'Repeatable weekly exposures support the goal.', goalTargetDate: '2027-04-01' })
const built = buildRollingWeeklyPlan({ source: 'initial', windowStart: '2026-09-14', profile, direction })
if (built.kind !== 'weekly_plan') throw new Error('Expected synthetic weekly plan')
const week = built

async function setup(page: Page, pending = false) {
  const rows = coachingDecisionRows(owner)
  rows.review.rationale.messages = ['Keep the accepted dose while collecting comparable observations.']
  const context = projectCoachingDecisionContext({ ...rows, proposal: pending ? rows.proposal : null })
  context.acceptedOrigin = { authority: 'accepted_plan_origin', acceptedPlanVersionId: 'plan-1', reviewedBasePlanVersionId: 'previous-plan',
    validity: 'historical_accepted_snapshot', currentEligibility: 'not_evaluated', sourceStatus: 'corrected',
    decision: { ...structuredClone(context.decision!), rationale: ['The original review preserved the accepted dose.'], proposal: { state: 'accepted', id: 'old-proposal', proposedPlanVersionId: 'plan-1' } } }
  const current = { id: 'plan-1', status: 'accepted', window_start: week.windowStart, window_end: week.windowEnd, sequence_number: 1, intent: { weekly_plan: week } }
  const proposed = { ...structuredClone(week), title: 'Synthetic next week', reviewDecision: { reviewId: 'review-1', action: 'continue' } }
  const state = { stale: false, reads: 0, writes: [] as { path: string; body: Record<string, unknown> }[], unexpected: [] as string[], errors: [] as string[] }
  page.on('pageerror', error => state.errors.push(error.message))
  await page.clock.setFixedTime(new Date(now))
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
      if (url.pathname === '/api/coach/intake' && method === 'GET') return json(route, { exercisePreferencesEnabled: false, exercisePreferences: null })
      if (method === 'POST') state.writes.push({ path: url.pathname, body: route.request().postDataJSON() })
      if (url.pathname === '/api/coach' && method === 'GET') return json(route, { context: { userId: owner, storageAvailable: true, assessments: [], memories: [],
        activeProgram: { id: 'program-1', title: week.title, activePlanVersionId: 'plan-1', upcomingSessions: [], weeks: [], sessionCheckins: [] } } })
      if (url.pathname === '/api/coach/weekly' && method === 'GET') {
        state.reads++
        return json(route, { mode: 'rolling_weekly', program: { id: 'program-1', title: week.title, direction, goal_target_date: direction.goalTargetDate, active_plan_version_id: 'plan-1' },
          currentWeek: current, coachingDecision: state.stale ? { ...context, status: 'context_changed', decision: null } : context,
          // Deliberately stale pending/history remain present: shared decision must gate controls.
          pendingProposal: pending ? { id: 'proposal-1', proposed_plan_version_id: 'plan-2', weekly_review_id: 'review-1', status: 'proposed', idempotency_key: 'old-proposal-key' } : null,
          history: { plans: [current, { ...current, id: 'plan-2', status: 'proposed', intent: { weekly_plan: proposed } }], reviews: [{ ...rows.review, review_window_start: week.windowStart, confidence: 0.8, execution_summary: {}, idempotency_key: 'old-review-key' }] } })
      }
      if (url.pathname === '/api/coach/proposals/proposal-1/accept') { state.stale = true; return json(route, { error: 'Training information changed. Refresh and review again.' }, 409) }
      if (url.pathname === '/api/coach/weekly/review') return json(route, { review: { id: 'fresh-review', status: 'ready', action: 'shift_emphasis', presentationClass: 'material_change',
        evidenceStatus: 'insufficient', proposal: { eligible: false }, rationale: ['Current availability changed.'], executionSummary: { completedSessions: 2, plannedSessions: 3, skippedSessions: 1, pastDuePlannedSessions: 0, averageSessionRpe: null },
        directionReconciliation: { version: 'direction-reconciliation-1', status: 'changed', reasons: ['Current availability changed.'], changedFields: ['training_schedule'], replacementPlanningInput: replacement, goalTargetDate: null } },
        nextAction: { type: 'confirm_replacement_direction' }, activePlanChanged: false }, 201)
      if (url.pathname === '/api/coach/intent') return json(route, { enabled: false, snapshot: null, baselineCandidates: [] })
      if (url.pathname === '/api/coach/trust') return json(route, { trust: { available: true, memories: [], imports: [], goals: [], qualities: [], signalSummary: [], proposals: [] }, exercisePreferencesEnabled: false })
      if (url.pathname === '/api/capture/drafts') return json(route, { userId: owner, drafts: [] })
      if (url.pathname === '/api/recommendations/refresh') return json(route, { status: 'disabled', recommendations: [], refreshState: null })
    }
    state.unexpected.push(`${method} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })
  return state
}

for (const colorScheme of ['light', 'dark'] as const) test(`saved and historical decision details at mobile widths in ${colorScheme}`, async ({ page }) => {
  const state = await setup(page)
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
  await page.goto('/program')
  await page.getByText('Why this recommendation', { exact: true }).click()
  await expect(page.getByText('Keep the accepted dose while collecting comparable observations.', { exact: true })).toBeVisible()
  await page.getByText('Why this accepted week was chosen', { exact: true }).focus(); await page.keyboard.press('Enter')
  await expect(page.getByText(/Some source records have since been corrected/)).toBeVisible()
  await expect(page.getByText(/baseline 100, recent 101 kg/)).toBeVisible()
  await expect(page.getByText(/incompatible_comparability_series/)).toBeVisible()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const label of ['Why this recommendation', 'Why this accepted week was chosen']) expect((await page.getByText(label, { exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    expect((await page.getByRole('button', { name: 'Build next week from saved review' }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: `output/playwright/app-quality-results/programming-quality/saved-${colorScheme}-${width}.png`, fullPage: true })
  }
  await expect(page.getByRole('button', { name: 'Accept next week' })).toHaveCount(0)
  expect(state.writes).toEqual([]); expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([])
})

for (const width of [390, 320]) test(`stale acceptance refreshes and hydrates current replacement setup at ${width}`, async ({ page }) => {
  const state = await setup(page, true)
  await page.setViewportSize({ width, height: 844 })
  await page.goto('/program')
  await page.getByRole('button', { name: 'Accept next week', exact: true }).click()
  await expect(page.getByText('Your training information changed after this review.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Accept next week' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Build next week from saved review' })).toHaveCount(0)
  expect(state.reads).toBeGreaterThanOrEqual(2)
  await page.getByRole('button', { name: 'Review this week', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Set your training direction' })).toBeVisible()
  await expect(page.getByLabel('Session length', { exact: true })).toHaveValue('45')
  await expect(page.getByLabel('Tuesday', { exact: true })).toBeChecked()
  await expect(page.getByLabel('Thursday', { exact: true })).toBeChecked()
  await expect(page.getByLabel('Monday', { exact: true })).not.toBeChecked()
  await expect(page.getByLabel('Goal target date', { exact: true })).toHaveValue('')
  const confirm = page.getByRole('checkbox', { name: 'These training days, session duration and equipment are accurate.' })
  await expect(confirm).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Build replacement week' })).toBeDisabled()
  await expect(page.getByLabel('Goal', { exact: true })).toHaveCSS('font-size', '16px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: `output/playwright/app-quality-results/programming-quality/replacement-${width}.png`, fullPage: true })
  expect(state.writes.map(write => write.path)).toEqual(['/api/coach/proposals/proposal-1/accept', '/api/coach/weekly/review'])
  expect(state.writes[1].body).toMatchObject({ tzOffset: 300, windowDays: 84 })
  expect(state.writes[1].body.reviewIdempotencyKey).not.toBe('old-review-key')
  expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([])
})
