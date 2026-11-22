// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sociusTodayHtml } from '../../app/lib/coach/today-app-ui'
import type { projectTodayRecovery } from '../../app/lib/coach/recovery-today-app'
import type { TodayWorkoutRecommendation } from '../../app/lib/coach/today-workout-recommendation'

const date = '2026-11-20'
const readAt = '2026-11-20T11:40:00.000Z'
const retiredControls = ['ask', 'activity-ask', 'workout-log', 'nutrition-log', 'chat-prompt', 'copy-prompt']

const lastWorkout = {
  status: 'available',
  date: '2026-11-19',
  timing: 'date_only',
  sessionRpe: 7,
  movements: [
    { name: 'Easy cycle', measurements: ['5 min'], phase: 'warmup' },
    { name: 'Front squat', measurements: ['3 sets × 5 reps'] },
  ],
}
const recovery = { status: 'saved', recoveryScore: 79, sleepPerformance: 82, strainScore: 6 } as const
const initialRecommendation: TodayWorkoutRecommendation = {
  status: 'recommended', source: 'saved_recommendation', title: 'Keep today easy',
  reason: 'Your saved review calls for recovery.',
  sessions: [{ title: 'Aerobic session', focus: 'Easy pace', status: 'planned', details: ['Bike · 20 min'] }],
}
const easierGuidance = {
  title: 'Keep the intensity easy today',
  summary: 'Choose an easy session or take a recovery day.',
  reasons: ['Your fatigue is higher than usual.'],
  actions: ['Start with 5 minutes at an easy pace.'],
}
const usualGuidance = {
  title: 'Train at your usual effort',
  summary: 'Start with a warm-up and reassess.',
  reasons: ['You reported your usual fatigue.'],
  actions: ['Build toward moderate effort.'],
}

const usualCheckIn = { stress: 'usual', fatigue: 'usual', sleep: 'usual', soreness: 'usual', motivation: 'usual' }
const harderCheckIn = { stress: 'usual', fatigue: 'higher', sleep: 'worse', soreness: 'higher', motivation: 'lower' }
type CheckIn = typeof usualCheckIn
const checkInFields = Object.keys(usualCheckIn) as Array<keyof CheckIn>

interface HostRequest {
  id?: number
  method: string
  params?: Record<string, unknown>
}

function mountWidget(workoutRecommendation = initialRecommendation, browserClock?: DateConstructor, options: {
  savedCheckIn?: CheckIn
  checkInEnabled?: boolean
} = {}) {
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  const child = iframe.contentWindow!
  if (browserClock) Object.defineProperty(child, 'Date', { value: browserClock })
  const host = child.parent
  const widget = child.document
  const requests: HostRequest[] = []
  let mealCount = 0
  const savedCheckIns = new Map<string, CheckIn>()
  if (options.savedCheckIn) savedCheckIns.set(date, options.savedCheckIn)
  let loseNextSaveReceipt = false
  let nextReadError = false
  let todayDate = date
  let todayRecovery: Partial<ReturnType<typeof projectTodayRecovery>> = recovery
  let holdNextToday = false
  let respondToHeldToday: (() => void) | undefined

  vi.spyOn(host, 'postMessage').mockImplementation((request: HostRequest) => {
    requests.push(request)
    if (request.id === undefined) return
    let result: unknown
    if (request.method === 'ui/initialize') {
      result = { hostCapabilities: { message: { text: {} }, experimental: { 'openai/message': {} } } }
    } else if (request.params?.name === 'open_socius_today') {
      const checkIn = savedCheckIns.get(todayDate)
      if (nextReadError) {
        nextReadError = false
        result = { isError: true }
      } else {
        result = { _meta: {
          today: {
            date: todayDate, readAt, workoutRecommendation, sessions: workoutRecommendation.sessions,
            recentWork: [], lastWorkout, recovery: todayRecovery,
            checkIn: checkIn ? { status: 'saved', checkIn } : { status: 'missing' },
            ...(checkIn && { assessmentGuidance: checkIn.fatigue === 'higher' ? easierGuidance : usualGuidance }),
          },
          activityEnabled: true,
          nutritionEnabled: true,
          checkInEnabled: options.checkInEnabled ?? true,
        } }
      }
    } else if (request.params?.name === 'save_socius_today_check_in') {
      const { date: savedDate, checkIn } = request.params.arguments as { date: string; checkIn: CheckIn }
      savedCheckIns.set(savedDate, checkIn)
      result = loseNextSaveReceipt ? { isError: true } : { _meta: { savedCheckIn: { date: savedDate, checkIn } } }
      loseNextSaveReceipt = false
    } else if (request.params?.name === 'show_socius_activity') {
      result = { _meta: { activity: {
        ...(request.params.arguments as object),
        workouts: { status: 'no_records', entries: [] },
        meals: { status: 'no_records', entries: [] },
      } } }
    } else if (request.params?.name === 'read_socius_nutrition') {
      result = { _meta: { nutrition: {
        date, readAt, timezone: 'UTC', mealCount,
        mealStatus: mealCount ? 'available' : 'no_records', targetStatus: 'not_configured',
        totals: { protein: mealCount * 30, carbs: 0, fat: 0, calories: mealCount * 120 },
      } } }
    }
    const respond = () => child.dispatchEvent(new MessageEvent('message', {
      source: host, data: { jsonrpc: '2.0', id: request.id, result },
    }))
    if (holdNextToday && request.params?.name === 'open_socius_today') {
      holdNextToday = false
      respondToHeldToday = respond
    } else respond()
  })

  widget.open()
  widget.write(sociusTodayHtml)
  widget.close()

  return {
    widget,
    element: (id: string) => widget.getElementById(id)!,
    requests,
    setMealCount: (count: number) => { mealCount = count },
    setTodayDate: (value: string) => { todayDate = value },
    setSavedCheckIn: (checkIn: CheckIn) => { savedCheckIns.set(todayDate, checkIn) },
    setRecovery: (values: Partial<ReturnType<typeof projectTodayRecovery>>) => { todayRecovery = { ...recovery, ...values } },
    holdNextToday: () => { holdNextToday = true },
    releaseHeldToday: () => { respondToHeldToday?.() },
    loseNextSaveReceipt: () => { loseNextSaveReceipt = true },
    failNextRead: () => { nextReadError = true },
  }
}

function choose(control: HTMLSelectElement, value: string) {
  control.value = value
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

function fillCheckIn(element: (id: string) => HTMLElement, values: CheckIn) {
  for (const field of checkInFields) choose(element('check-in-' + field) as HTMLSelectElement, values[field])
}

function checkInValues(element: (id: string) => HTMLElement) {
  return checkInFields.map(field => (element('check-in-' + field) as HTMLSelectElement).value)
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('SociusFit dashboard', () => {
  it('orders the recommendation, WHOOP, and collapsed last workout', async () => {
    const { element } = mountWidget()
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const panels = Array.from(element('today-content').children)
    expect(panels[0].contains(element('check-in-form'))).toBe(true)
    expect(panels[1].contains(element('whoop-gauges'))).toBe(true)
    expect(panels[2]).toBe(element('last-workout'))
    expect(element('recovery-percent').textContent).toBe('79%')
    expect(element('recommendation-title').textContent).toBe('')
    const acceptedPlan = element('accepted-plan-details') as HTMLDetailsElement
    expect(acceptedPlan.open).toBe(false)
    expect(acceptedPlan.textContent).toContain('Bike · 20 min')
    expect(element('saved-review').hidden).toBe(true)
    expect(acceptedPlan.textContent).toContain('Keep today easy')

    const workout = element('last-workout') as HTMLDetailsElement
    const summary = workout.querySelector<HTMLElement>(':scope > summary')!
    expect(summary.textContent).toContain('Last workout logged')
    expect(summary.contains(element('recent'))).toBe(false)
    expect(workout.open).toBe(false)
    summary.click()
    expect(workout.open).toBe(true)
    expect(element('workout-rpe').textContent).toContain('7 / 10')
    expect(element('recent-warmup').textContent).toContain('Easy cycle')
    expect(element('recent').textContent).toContain('Front squat')
    summary.click()
    expect(workout.open).toBe(false)
  })

  it('shows review-first saved guidance above the check-in', async () => {
    const { element } = mountWidget({
      status: 'recommended', source: 'saved_recommendation', title: 'Review your training before starting',
      reason: 'Your recent logs need a review.', reviewBeforeTraining: true, sessions: [],
    })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const review = element('saved-review')
    expect(review.hidden).toBe(false)
    expect(review.compareDocumentPosition(element('check-in-form'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(element('saved-review-title').textContent).toBe('Review your training before starting')
    expect(element('saved-review-reason').textContent).toBe('Your recent logs need a review.')
    expect(element('recommendation-result').hidden).toBe(true)
    expect(element('accepted-plan-details').hidden).toBe(true)
  })

  it('saves all five answers before reading guidance and can retry an uncertain save', async () => {
    const { element, requests, loseNextSaveReceipt, failNextRead } = mountWidget()
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const form = element('check-in-form') as HTMLFormElement
    const button = element('check-in-submit') as HTMLButtonElement
    const saveRequests = () => requests
      .filter(request => request.params?.name === 'save_socius_today_check_in')
      .map(request => request.params?.arguments)
    button.click()
    expect(saveRequests()).toHaveLength(0)
    fillCheckIn(element, harderCheckIn)
    expect(form.checkValidity()).toBe(true)
    button.click()
    await vi.waitFor(() => expect(element('recommendation-title').textContent).toBe(easierGuidance.title))
    expect(element('recommendation-summary').textContent).toBe(easierGuidance.summary)
    expect(element('recommendation-reasons').textContent).toContain(easierGuidance.reasons[0])
    expect(element('recommendation-actions').textContent).toContain(easierGuidance.actions[0])
    expect(saveRequests()).toMatchObject([
      { date, tzOffset: expect.any(Number), checkIn: harderCheckIn },
    ])
    expect(requests.filter(request => request.method === 'tools/call').map(request => request.params)).toEqual([
      { name: 'open_socius_today', arguments: { tzOffset: expect.any(Number) } },
      { name: 'save_socius_today_check_in', arguments: { date, tzOffset: expect.any(Number), checkIn: harderCheckIn } },
      { name: 'open_socius_today', arguments: { tzOffset: expect.any(Number) } },
    ])
    expect(element('recommendation-result').textContent).toContain('Ask in chat to adjust today’s plan.')
    expect(element('check-in-status').textContent).toContain('Check-in saved for today.')

    loseNextSaveReceipt()
    failNextRead()
    fillCheckIn(element, usualCheckIn)
    expect(element('recommendation-title').textContent).toBe('')
    button.click()
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    expect(element('check-in-status').textContent).toMatch(/could not confirm.*try again/i)
    expect(element('today-content').hidden).toBe(false)
    expect(checkInValues(element)).toEqual(Object.values(usualCheckIn))

    button.click()
    await vi.waitFor(() => expect(element('recommendation-title').textContent).toBe(usualGuidance.title))
    expect(element('recommendation-reasons').textContent).toContain(usualGuidance.reasons[0])
    expect(element('recommendation-reasons').textContent).not.toContain(easierGuidance.reasons[0])
    expect(saveRequests().slice(1)).toMatchObject([
      { date, checkIn: usualCheckIn },
      { date, checkIn: usualCheckIn },
    ])
    expect(requests.filter(request => request.method === 'ui/message')).toHaveLength(0)
  })

  it('confirms a lost receipt from saved records without sending another save', async () => {
    const { element, requests, loseNextSaveReceipt } = mountWidget()
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    fillCheckIn(element, harderCheckIn)
    loseNextSaveReceipt()
    element('check-in-submit').click()
    await vi.waitFor(() => expect(element('recommendation-title').textContent).toBe(easierGuidance.title))
    expect(element('check-in-status').textContent).toBe('Check-in saved for today. Recommendation ready.')
    expect(requests.filter(request => request.method === 'tools/call').map(request => request.params?.name)).toEqual([
      'open_socius_today', 'save_socius_today_check_in', 'open_socius_today',
    ])
  })

  it('hydrates the saved answers and recommendation from the first read even when writes are disabled', async () => {
    const { element, requests } = mountWidget(initialRecommendation, undefined, {
      savedCheckIn: harderCheckIn, checkInEnabled: false,
    })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    expect(checkInValues(element)).toEqual(Object.values(harderCheckIn))
    expect(element('recommendation-title').textContent).toBe(easierGuidance.title)
    expect(element('check-in-status').textContent).toBe('Check-in saved for today. Editing is currently unavailable.')
    expect((element('check-in-submit') as HTMLButtonElement).disabled).toBe(true)
    expect(requests.filter(request => request.method === 'tools/call').map(request => request.params?.name))
      .toEqual(['open_socius_today'])
  })

  it('retains a saved receipt when the plan read fails and retries only the read', async () => {
    const { element, requests, failNextRead } = mountWidget()
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    fillCheckIn(element, harderCheckIn)
    failNextRead()
    const button = element('check-in-submit') as HTMLButtonElement
    button.click()
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    expect(element('check-in-status').textContent).toBe('Check-in saved for today. Could not refresh the recommendation. Try again.')
    expect(checkInValues(element)).toEqual(Object.values(harderCheckIn))
    expect(button.textContent).toBe('Refresh recommendation')

    button.click()
    await vi.waitFor(() => expect(element('recommendation-title').textContent).toBe(easierGuidance.title))
    expect(requests.filter(request => request.method === 'tools/call').map(request => request.params?.name)).toEqual([
      'open_socius_today', 'save_socius_today_check_in', 'open_socius_today', 'open_socius_today',
    ])
  })

  it('preserves the draft when a newer check-in is read after a lost receipt', async () => {
    const { element, requests, loseNextSaveReceipt, setSavedCheckIn } = mountWidget()
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    fillCheckIn(element, harderCheckIn)
    loseNextSaveReceipt()
    const button = element('check-in-submit') as HTMLButtonElement
    button.click()
    setSavedCheckIn(usualCheckIn)

    await vi.waitFor(() => expect(button.disabled).toBe(false))
    expect(checkInValues(element)).toEqual(Object.values(harderCheckIn))
    expect(button.textContent).toBe('Save & get recommendation')
    expect(element('check-in-status').textContent).toContain('Could not confirm')
    expect(requests.filter(request => request.params?.name === 'save_socius_today_check_in')).toHaveLength(1)
  })

  it('clears the previous check-in and reads the new day when the widget regains focus', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 20, 23, 59))
    const { widget, element, requests, setTodayDate } = mountWidget(initialRecommendation, Date)
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    fillCheckIn(element, usualCheckIn)
    element('check-in-submit').click()
    await vi.waitFor(() => expect(element('recommendation-title').textContent).toBe(usualGuidance.title))
    const workout = element('last-workout') as HTMLDetailsElement
    workout.open = true

    vi.setSystemTime(new Date(2026, 10, 21, 0, 1))
    setTodayDate('2026-11-21')
    widget.defaultView!.dispatchEvent(new Event('focus'))

    await vi.waitFor(() => expect(element('today-date').getAttribute('datetime')).toBe('2026-11-21'))
    expect(element('today-content').hidden).toBe(false)
    expect(element('recommendation-result').hidden).toBe(true)
    expect(element('check-in-status').textContent).toBe('')
    expect(checkInValues(element)).toEqual(checkInFields.map(() => ''))
    expect(workout.open).toBe(false)
    expect(requests.filter(request => request.params?.name === 'open_socius_today').at(-1)?.params?.arguments)
      .toEqual({ tzOffset: expect.any(Number) })
  })

  it('refreshes only saved WHOOP data on same-day foreground and coalesces overlapping events', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 20, 14))
    const {
      widget, element, requests, setRecovery, holdNextToday, releaseHeldToday,
    } = mountWidget(initialRecommendation, Date)
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    fillCheckIn(element, usualCheckIn)
    element('check-in-submit').click()
    await vi.waitFor(() => expect(element('recommendation-title').textContent).toBe(usualGuidance.title))
    const workout = element('last-workout') as HTMLDetailsElement
    const workoutRows = element('recent').firstChild
    workout.open = true
    const foreground = () => widget.defaultView!.dispatchEvent(new Event('focus'))
    const todayCalls = () => requests.filter(request => request.params?.name === 'open_socius_today')

    setRecovery({
      recoveryScore: 64, sleepScoreStatus: 'stale',
      recoveryUpdatedAt: '2026-11-20T12:30:00Z',
      sleepUpdatedAt: '2026-11-19T13:30:00Z',
      strainUpdatedAt: '2026-11-20T13:30:00Z',
      lastSyncAt: '2026-11-20T14:00:00Z',
    })
    foreground()
    expect(todayCalls()).toHaveLength(2)
    holdNextToday()
    vi.setSystemTime(new Date(2026, 10, 20, 14, 1))
    foreground()
    widget.dispatchEvent(new Event('visibilitychange'))
    expect(todayCalls()).toHaveLength(3)
    expect(element('today-content').hidden).toBe(false)
    expect(element('recovery-percent').textContent).toBe('79%')
    releaseHeldToday()

    await vi.waitFor(() => expect(element('recovery-percent').textContent).toBe('64%'))
    foreground()
    expect(todayCalls()).toHaveLength(3)
    expect(element('sleep-note').hidden).toBe(false)
    expect(element('recovery-score-note').hidden).toBe(true)
    expect(Array.from(element('recovery-dates').querySelectorAll('time')).map(time => time.dateTime)).toEqual([
      '2026-11-20T12:30:00Z', '2026-11-19T13:30:00Z', '2026-11-20T13:30:00Z', '2026-11-20T14:00:00Z',
    ])
    expect(element('recommendation-title').textContent).toBe(usualGuidance.title)
    expect(checkInValues(element)).toEqual(Object.values(usualCheckIn))
    expect(workout.open).toBe(true)
    expect(element('recent').firstChild).toBe(workoutRows)
    expect(todayCalls().at(-1)?.params?.arguments).toEqual({ tzOffset: expect.any(Number) })
  })

  it('retains a newer check-in snapshot when a foreground WHOOP refresh finishes late', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 20, 14))
    const { widget, element, setRecovery, holdNextToday, releaseHeldToday } = mountWidget(initialRecommendation, Date)
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    vi.setSystemTime(new Date(2026, 10, 20, 14, 1))
    setRecovery({ recoveryScore: 65 })
    holdNextToday()
    widget.defaultView!.dispatchEvent(new Event('focus'))

    setRecovery({ recoveryScore: 82 })
    fillCheckIn(element, usualCheckIn)
    element('check-in-submit').click()
    await vi.waitFor(() => expect(element('recovery-percent').textContent).toBe('82%'))
    releaseHeldToday()
    await Promise.resolve()

    expect(element('recovery-percent').textContent).toBe('82%')
    expect(element('recommendation-title').textContent).toBe(usualGuidance.title)
  })

  it('loads Activity and refreshes Nutrition without exposing dashboard chat actions', async () => {
    const { widget, element, requests, setMealCount } = mountWidget({
      status: 'unscheduled', source: 'accepted_plan', title: 'No workout scheduled today', reason: null, sessions: [],
    })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    expect(element('accepted-plan-details').hidden).toBe(true)
    for (const id of retiredControls) expect(widget.getElementById(id)).toBeNull()

    element('show-activity').click()
    await vi.waitFor(() => expect(element('activity-card').hidden).toBe(false))
    element('previous-day').click()
    await vi.waitFor(() => expect(element('activity-card').hidden).toBe(false))
    expect(requests.filter(request => request.params?.name === 'show_socius_activity').map(request => request.params?.arguments))
      .toMatchObject([{ date: '2026-11-19' }, { date: '2026-11-18' }])

    element('show-nutrition').click()
    await vi.waitFor(() => expect(element('nutrition-refresh').hidden).toBe(false))
    expect(element('nutrition-meal-count').textContent).toBe('0 saved meals')
    setMealCount(1)
    element('nutrition-refresh').click()
    await vi.waitFor(() => expect(element('nutrition-meal-count').textContent).toBe('1 saved meal'))
    expect(element('nutrition-progress').textContent).toContain('30 g logged')
    expect(requests.filter(request => request.method === 'ui/message')).toHaveLength(0)
  })
})
