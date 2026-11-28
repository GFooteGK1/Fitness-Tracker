import { expect, test, type Locator, type Page } from '@playwright/test'
import { sociusTodayHtml } from '../app/lib/coach/today-app-ui'

const date = '2026-11-23'
const readAt = '2026-11-23T18:00:00Z'
const latestWorkoutDate = '2026-11-19'
const finalWorkoutDetail = 'Cooldown: easy walk · 5 min'
const toolResults = {
  open_socius_today: {
    today: {
      date, readAt, sessions: [], recentWork: [],
      recovery: { status: 'saved', recoveryScore: 36, sleepPerformance: 79, strainScore: 0.5 },
      lastWorkout: {
        status: 'available', date: latestWorkoutDate,
        movements: [{ name: 'Front squat', measurements: ['3 sets × 5 reps'] }],
      },
    },
    checkInEnabled: true, activityEnabled: true, nutritionEnabled: true,
  },
  show_socius_activity: {
    activity: {
      date: latestWorkoutDate, timezone: 'America/Chicago',
      workouts: { status: 'available', entries: [{
        label: 'Strength session', revision: 1,
        details: [...Array.from({ length: 16 }, (_, index) => `Saved set ${index + 1} · 5 reps`), finalWorkoutDetail],
      }] },
    },
  },
  read_socius_training_progress: {
    progress: {
      timezone: 'America/Chicago',
      workouts: { currentMonth: 'November 2026', monthToDate: 7, totalWorkouts: 40, strengthSessions: 20, metcons: 8, cardio: 17 },
      records: {
        monthCount: 3,
        entries: [{
          exercise: 'Single-arm overhead kettlebell reverse lunge with a long recorded movement name',
          type: 'Max weight', date: '2026-11-18', value: '62.5 lbs',
        }],
      },
    },
  },
  read_socius_nutrition: {
    nutrition: {
      date, readAt, timezone: 'America/Chicago', mealCount: 2, mealStatus: 'available', targetStatus: 'available',
      totals: { protein: 68, carbs: 84, fat: 31, calories: 887 },
      targets: { protein: 155, carbs: 210, fat: 70, calories: 2090 },
      weekToDate: {
        startDate: date, endDate: date, days: 1, loggedDays: 1, mealStatus: 'available', targetStatus: 'available',
        totals: { protein: 68, carbs: 84, fat: 31, calories: 887 },
        targets: { protein: 155, carbs: 210, fat: 70, calories: 2090 },
      },
    },
  },
}

type HostRequest = {
  method: string
  params?: {
    name?: keyof typeof toolResults | 'save_socius_today_check_in'
    arguments?: { date?: string, checkIn?: Record<string, number>, sessionDraftOnly?: boolean, whoopOnly?: boolean }
    content?: { text: string }[]
  }
}

const hostContext = { displayMode: 'fullscreen', platform: 'mobile', theme: 'dark' }

function defaultHostResponse({ method, params }: HostRequest) {
  if (method === 'ui/initialize') return { hostContext }
  const name = params?.name
  if (name === 'show_socius_activity' && params?.arguments?.date) {
    return { _meta: { activity: { ...toolResults[name].activity, date: params.arguments.date } } }
  }
  return { _meta: name && name !== 'save_socius_today_check_in' ? toolResults[name] : undefined }
}

async function openDashboard(page: Page, respond: (request: HostRequest) => unknown = defaultHostResponse) {
  await page.clock.install({ time: new Date(readAt) })
  await page.exposeFunction('sociusHostResponse', respond)
  await page.route('**/socius-test-widget', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: sociusTodayHtml,
  }))
  await page.route('**/socius-test-host', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { margin: 0; overflow: hidden; }
        iframe { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; }
        #composer { position: fixed; inset: auto 0 0; height: 140px; background: #20272b; color: white; }
      </style>
      <iframe title="SociusFit" sandbox="allow-scripts allow-forms" src="/socius-test-widget"></iframe>
      <div id="composer">ChatGPT follow-up composer</div>
      <script>
        const widget = document.querySelector('iframe');
        window.addEventListener('message', async event => {
          if (event.source !== widget.contentWindow || event.data?.id == null) return;
          const { id } = event.data;
          const result = await window.sociusHostResponse(event.data);
          event.source.postMessage({ jsonrpc: '2.0', id, result }, '*');
        });
      </script>`,
  }))
  await page.goto('/socius-test-host')
  return page.frameLocator('iframe[title="SociusFit"]')
}

test.describe('SociusFit Today’s training session', () => {
  test.use({ isMobile: true, hasTouch: true })

  test('WHOOP shares the session card style and keeps saved recovery through disclosure and refresh', async ({ page }) => {
    const saved = toolResults.open_socius_today
    let recoveryScore = saved.today.recovery.recoveryScore
    let reads = 0
    let compactReads = 0
    const widget = await openDashboard(page, request => {
      if (request.params?.name !== 'open_socius_today') return defaultHostResponse(request)
      reads += 1
      if (request.params.arguments?.whoopOnly) {
        compactReads += 1
        return { _meta: { today: { date, recovery: { ...saved.today.recovery, recoveryScore, recoveryUpdatedAt: readAt } } } }
      }
      return { _meta: { ...saved, today: {
        ...saved.today,
        workoutRecoveryKey: 'displayed-workout',
        recovery: {
          ...saved.today.recovery, recoveryScore, recoveryUpdatedAt: readAt,
          sessionEffort: { status: 'timing_unverified', rpe: 7 },
        },
      } } }
    })

    const session = widget.locator('#training-session')
    const sessionSummary = widget.locator('#training-session > summary')
    const whoop = widget.locator('#whoop-panel')
    const whoopSummary = widget.locator('#whoop-panel > summary')
    const details = whoop.locator('#whoop-details')
    const score = whoop.locator('#recovery-percent')
    await expect(sessionSummary).toBeVisible()
    const sessionStyle = await session.evaluate(element => {
      const style = getComputedStyle(element)
      return { accent: style.borderTopColor, thickness: style.borderTopWidth, radius: style.borderTopLeftRadius }
    })
    expect(Number.parseFloat(sessionStyle.thickness)).toBeGreaterThan(1)
    await expect(whoop).toHaveCSS('border-top-color', sessionStyle.accent)
    await expect(whoop).toHaveCSS('border-top-width', sessionStyle.thickness)
    await expect(whoop).toHaveCSS('border-top-left-radius', sessionStyle.radius)
    expect((await whoopSummary.boundingBox())?.height).toBeGreaterThanOrEqual(44)

    await expect(whoop).toHaveJSProperty('open', true)
    await expect(whoop.locator('#sleep-score-value')).toHaveText('79%')
    await expect(score).toHaveText('36%')
    await expect(whoop.locator('#strain-score-value')).toHaveText('0.5')
    await widget.locator('#check-in-panel > summary').press('Enter')
    await whoopSummary.press('Space')
    await expect(whoop).toHaveJSProperty('open', false)
    await expect(score).toBeHidden()
    await whoopSummary.tap()
    await expect(score).toBeVisible()
    await expect(session).toHaveJSProperty('open', false)

    await details.locator('summary').press('Enter')
    await expect(details.getByText('Session RPE', { exact: true })).toBeVisible()
    await expect(details.getByText('7 / 10', { exact: true })).toBeVisible()
    await expect(details.locator('time')).toHaveAttribute('datetime', readAt)
    await whoopSummary.press('Enter')
    await expect(whoop).toHaveJSProperty('open', false)

    recoveryScore = 64
    await page.clock.runFor(30_100)
    await widget.locator('html').evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(score).toHaveText('64%')
    await expect(whoop).toHaveJSProperty('open', false)
    expect(reads).toBe(2)
    await whoopSummary.tap()
    await expect(score).toBeVisible()
    await expect(details.getByText('7 / 10', { exact: true })).toBeVisible()

    recoveryScore = 68
    const checkWhoop = whoop.getByRole('button', { name: 'Check for saved updates' })
    await checkWhoop.tap()
    await expect(score).toHaveText('68%')
    await expect(whoop.getByRole('status')).toHaveText('Showing updated WHOOP readings.')
    await expect(details.getByText('7 / 10', { exact: true })).toBeVisible()
    expect(compactReads).toBe(1)

    await checkWhoop.tap()
    await expect(whoop.getByRole('status')).toHaveText('Your last check found no new saved WHOOP readings.')
    await expect(whoop.getByText('Sync Now', { exact: true })).toBeVisible()
    expect(compactReads).toBe(2)
  })

  test('opens independently from the check-in and retains the saved draft through the local day', async ({ page }) => {
    const draft = {
      date, dayType: 'training', title: 'Controlled lower-body strength', objective: 'Build squat strength.',
      goal: 'Stronger lower body', weekReview: 'Two lower-body sessions are saved.',
      rationale: 'Practice the squat at a manageable dose.', checkInAdjustment: 'Leave three reps in reserve today.',
      warmUp: [{ activity: 'Bodyweight squat', dose: '2 sets × 8 reps', effort: 'Easy', rest: '30 seconds' }],
      mainWork: [{ activity: 'Front squat', dose: '3 sets × 5 reps', effort: 'RPE 7', rest: '2 minutes' }],
      supportingWork: [], cooldown: [], scaleWhen: 'Reps slow down.', stopWhen: 'Pain changes your technique.',
      sourceDates: ['2026-11-22'], historyComplete: true,
    }
    const checkInRevision = '45c42d22-ed2a-47a9-a226-1f5064fe98ff'
    let currentDate = date
    let savedCheckIn: { date?: string, checkIn?: Record<string, number> } = {}
    let requestText = ''
    let draftReady = false
    let completedDraft: typeof draft | undefined
    const widget = await openDashboard(page, request => {
      const { method, params } = request
      if (method === 'ui/initialize') return { hostContext, hostCapabilities: { message: { text: {} } } }
      if (method === 'ui/message') {
        requestText = params?.content?.[0]?.text ?? ''
        return {}
      }
      if (params?.name === 'save_socius_today_check_in') {
        savedCheckIn = params.arguments ?? {}
        return { _meta: { savedCheckIn: { ...savedCheckIn, revision: checkInRevision } } }
      }
      if (params?.name !== 'open_socius_today') return defaultHostResponse(request)

      const isDraftRead = params.arguments?.sessionDraftOnly === true
      if (isDraftRead && draftReady && savedCheckIn.date === draft.date && requestText.includes(checkInRevision)) {
        completedDraft = draft
      }
      const sessionDraft = completedDraft?.date === currentDate ? completedDraft : undefined
      const session = { date: currentDate, sessionDraftStatus: sessionDraft ? 'saved' : 'missing', sessionDraft }
      if (isDraftRead) return { _meta: { today: session } }
      const saved = toolResults.open_socius_today
      const assessment = savedCheckIn.date === currentDate
        ? { status: 'saved', scale: '1-to-5', checkIn: savedCheckIn.checkIn, revision: checkInRevision }
        : { status: 'missing' }
      return { _meta: { ...saved, sessionDraftSavingEnabled: true, today: { ...saved.today, ...session, assessment } } }
    })

    const checkIn = widget.locator('#check-in-panel')
    const checkInToggle = checkIn.locator('summary').first()
    const session = widget.locator('#training-session')
    const sessionToggle = session.locator('summary').first()
    const heading = session.getByRole('heading', { name: draft.title })
    await expect(widget.getByLabel('Stress')).toBeEnabled()
    await expect(checkInToggle.getByText('How I am feeling', { exact: true })).toBeVisible()
    await expect(sessionToggle).toHaveText('Today’s training session')
    await expect(checkIn).toHaveJSProperty('open', true)
    await checkInToggle.tap()
    await expect(checkIn).toHaveJSProperty('open', false)
    await expect(session).toHaveJSProperty('open', false)
    await checkInToggle.press('Enter')
    await expect(checkIn).toHaveJSProperty('open', true)

    for (const label of ['Stress', 'Fatigue', 'Sleep', 'Soreness', 'Motivation']) {
      await widget.getByLabel(label).selectOption('4')
    }
    await widget.getByRole('button', { name: 'Save check-in & draft session' }).press('Enter')
    await expect(session.getByText('Preparing today’s session in SociusFit chat…')).toBeVisible()
    await expect(heading).toBeHidden()
    expect(requestText).toContain(`expectedLocalDate ${date}`)
    expect(requestText).toContain(`expectedCheckInRevision ${checkInRevision}`)
    expect(requestText).toContain('save_today_session_draft')
    draftReady = true
    await page.clock.runFor(3_100)
    await expect(heading).toBeVisible()
    await expect(session.getByText('3 sets × 5 reps')).toBeVisible()
    await expect(checkIn).toHaveJSProperty('open', false)

    await sessionToggle.tap()
    await expect(heading).toBeHidden()
    await expect(checkIn).toHaveJSProperty('open', false)
    await sessionToggle.press('Enter')
    await expect(heading).toBeVisible()
    await checkInToggle.tap()
    await expect(widget.getByLabel('Stress')).toHaveValue('4')
    await expect(session).toHaveJSProperty('open', true)

    await page.reload()
    await expect(heading).toBeVisible()
    await expect(checkIn).toHaveJSProperty('open', false)

    currentDate = '2026-11-24'
    await page.clock.fastForward(12 * 60 * 60 * 1000 + 60_000)
    await expect(widget.locator('#today-date')).toHaveAttribute('datetime', currentDate)
    await expect(checkIn).toHaveJSProperty('open', true)
    await expect(widget.getByLabel('Stress')).toHaveValue('')
    await expect(session).toHaveJSProperty('open', false)
    await expect(heading).toBeHidden()
  })
})

async function overComposer(page: Page, locator: Locator) {
  const composer = await page.locator('#composer').boundingBox()
  const bounds = await locator.boundingBox()
  return Boolean(composer && bounds && bounds.y >= 0 && bounds.y + bounds.height <= composer.y)
}

async function tapInPlace(page: Page, locator: Locator) {
  const bounds = await locator.boundingBox()
  if (!bounds) throw new Error('The control has no position to tap')
  await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
}

async function updateComposerInset(page: Page, bottom: number) {
  await page.locator('#composer').evaluate((composer, inset) => {
    composer.style.height = `${inset}px`
    document.querySelector('iframe')?.contentWindow?.postMessage({
      jsonrpc: '2.0',
      method: 'ui/notifications/host-context-changed',
      params: { safeAreaInsets: { top: 0, right: 0, bottom: inset, left: 0 } },
    }, '*')
  }, bottom)
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test.describe(`SociusFit at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true })

    test('shows training progress above the workout list and fits long records on mobile', async ({ page }) => {
      let progressReads = 0
      const widget = await openDashboard(page, request => {
        if (request.params?.name === 'read_socius_training_progress') progressReads += 1
        return defaultHostResponse(request)
      })
      await widget.getByRole('button', { name: 'Training Activity' }).tap()
      const card = widget.locator('#training-progress')
      const summary = card.locator('summary')
      await expect(card).toHaveJSProperty('open', false)
      await expect.poll(() => overComposer(page, summary)).toBe(true)
      expect(progressReads).toBe(0)
      expect((await summary.boundingBox())?.height).toBeGreaterThanOrEqual(44)
      await summary.tap()
      await expect(card.getByRole('heading', { name: 'Training summary' })).toBeVisible()
      await expect(card.locator('#progress-month-workouts')).toHaveText('7')
      await expect(card.locator('#progress-all-workouts')).toHaveText('40')
      await expect(card.getByText('3 improvements this month')).toBeVisible()
      await expect(card.getByText('62.5 lbs')).toBeVisible()
      expect(progressReads).toBe(1)
      const fitsViewport = await widget.locator('#dashboard-scroll').evaluate(scroll => scroll.scrollWidth <= scroll.clientWidth)
      expect(fitsViewport).toBe(true)
      await summary.press('Enter')
      await expect(card).toHaveJSProperty('open', false)
    })

    test('opens and collapses the Nutrition week-to-date card on mobile', async ({ page }) => {
      const widget = await openDashboard(page)
      await widget.getByRole('navigation', { name: 'SociusFit views' }).getByRole('button', { name: 'Nutrition' }).tap()
      const daily = widget.locator('#nutrition-daily')
      const dailySummary = widget.locator('#nutrition-daily > summary')
      const week = widget.locator('#nutrition-week')
      const summary = week.locator('summary')
      await expect(summary).toBeVisible()
      await expect(daily).toHaveJSProperty('open', true)
      await dailySummary.press('Enter')
      await expect(widget.locator('#nutrition-progress')).toBeHidden()
      await dailySummary.tap()
      await expect(widget.locator('#nutrition-progress')).toBeVisible()
      expect((await summary.boundingBox())?.height).toBeGreaterThanOrEqual(44)
      await expect(week).not.toHaveAttribute('open', '')
      await summary.tap()
      await expect(week).toHaveAttribute('open', '')
      await expect(week.getByText('1 of 1 day with saved meals.')).toBeVisible()
      await expect(week.getByLabel('Protein week-to-date progress')).toHaveAttribute('aria-valuetext', /43\.9%/)
      await expect(widget.locator('#nutrition-progress')).toBeVisible()
      await week.getByLabel('Calories week-to-date progress').scrollIntoViewIfNeeded()
      await expect(week.getByLabel('Calories week-to-date progress')).toBeVisible()
      await summary.tap()
      await expect(week).not.toHaveAttribute('open', '')
      await expect(widget.locator('#nutrition-progress')).toBeVisible()
    })

    test('all dashboard tabs can scroll their last content above the chat composer', async ({ page }) => {
      const widget = await openDashboard(page)
      const viewSwitch = widget.getByRole('navigation', { name: 'SociusFit views' })
      const scrollDown = async (lastContent: Locator) => {
        expect(await overComposer(page, lastContent)).toBe(false)
        await page.mouse.move(viewport.width / 2, viewport.height / 2)
        await page.mouse.wheel(0, 1600)
        await expect.poll(() => overComposer(page, lastContent), { timeout: 2000 }).toBe(true)
      }

      await viewSwitch.getByRole('button', { name: 'Nutrition' }).tap()
      const refresh = widget.getByRole('button', { name: 'Refresh totals' })
      await expect(refresh).toBeEnabled()
      await expect(widget.getByRole('button', { name: 'Log food in chat' })).toHaveCount(0)
      if (viewport.width === 390) {
        await updateComposerInset(page, 224)
        await widget.locator('#nutrition-week > summary').tap()
      }
      await scrollDown(refresh)
      await tapInPlace(page, refresh)
      await expect(widget.getByText('Nutrition totals refreshed.')).toBeVisible()

      const historyTab = viewSwitch.getByRole('button', { name: 'Training Activity' })
      await historyTab.tap()
      await expect(historyTab).toHaveAttribute('aria-pressed', 'true')
      await expect(widget.locator('#activity-load')).toBeEmpty()
      const lastWorkoutDetail = widget.getByText(finalWorkoutDetail, { exact: true })
      const trainingHistory = widget.locator('#activity-card')
      const historySummary = widget.locator('#activity-card > summary')
      await expect(trainingHistory).toHaveJSProperty('open', true)
      const workoutDate = widget.getByLabel('Workout date')
      await expect(workoutDate).toHaveValue(latestWorkoutDate)
      await expect(trainingHistory.locator('time')).toHaveAttribute('datetime', latestWorkoutDate)
      await expect(widget.getByRole('button', { name: /Previous day|Next day/ })).toHaveCount(0)
      await expect(lastWorkoutDetail).toBeVisible()
      await historySummary.press('Enter')
      await expect(lastWorkoutDetail).toBeHidden()
      await workoutDate.fill('2026-11-21')
      await expect(trainingHistory).toHaveJSProperty('open', true)
      await expect(trainingHistory.locator('time')).toHaveAttribute('datetime', '2026-11-21')
      await expect(lastWorkoutDetail).toBeVisible()
      await scrollDown(lastWorkoutDetail)

      await viewSwitch.getByRole('button', { name: 'Today' }).tap()
      const lastWorkout = widget.locator('#last-workout > summary')
      await expect(lastWorkout).toBeVisible()
      await scrollDown(lastWorkout)
      await tapInPlace(page, lastWorkout)
      await expect(widget.getByText('Front squat', { exact: true })).toBeVisible()
    })
  })
}
