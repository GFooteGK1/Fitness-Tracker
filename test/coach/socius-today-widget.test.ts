// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sociusTodayHtml } from '../../app/lib/coach/today-app-ui'
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
const recovery = { status: 'fresh', recoveryScore: 79, sleepPerformance: 82, strainScore: 6 }
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

interface HostRequest {
  id?: number
  method: string
  params?: Record<string, unknown>
}

function mountWidget(workoutRecommendation = initialRecommendation, browserClock?: DateConstructor) {
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  const child = iframe.contentWindow!
  if (browserClock) Object.defineProperty(child, 'Date', { value: browserClock })
  const host = child.parent
  const widget = child.document
  const requests: HostRequest[] = []
  let mealCount = 0
  let nextAssessmentError = false
  let todayDate = date

  vi.spyOn(host, 'postMessage').mockImplementation((request: HostRequest) => {
    requests.push(request)
    if (request.id === undefined) return
    let result: unknown
    if (request.method === 'ui/initialize') {
      result = { hostCapabilities: { message: { text: {} }, experimental: { 'openai/message': {} } } }
    } else if (request.params?.name === 'open_socius_today') {
      const args = request.params.arguments as { checkIn?: { fatigue: string } }
      const checkIn = args.checkIn
      if (checkIn && nextAssessmentError) {
        nextAssessmentError = false
        result = { isError: true }
      } else {
        result = { _meta: {
          today: {
            date: todayDate, readAt, workoutRecommendation, sessions: workoutRecommendation.sessions,
            recentWork: [], lastWorkout, recovery,
            ...(checkIn && { assessmentGuidance: checkIn.fatigue === 'higher' ? easierGuidance : usualGuidance }),
          },
          activityEnabled: true,
          nutritionEnabled: true,
        } }
      }
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
    child.dispatchEvent(new MessageEvent('message', {
      source: host, data: { jsonrpc: '2.0', id: request.id, result },
    }))
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
    failNextAssessment: () => { nextAssessmentError = true },
  }
}

function choose(control: HTMLSelectElement, value: string) {
  control.value = value
  control.dispatchEvent(new Event('change', { bubbles: true }))
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

  it('uses the completed check-in for guidance and can retry an updated check-in', async () => {
    const { element, requests, failNextAssessment } = mountWidget()
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const form = element('check-in-form') as HTMLFormElement
    const button = element('check-in-submit') as HTMLButtonElement
    const stress = element('check-in-stress') as HTMLSelectElement
    const fatigue = element('check-in-fatigue') as HTMLSelectElement
    const sleep = element('check-in-sleep') as HTMLSelectElement
    const assessmentRequests = () => requests
      .filter(request => request.params?.name === 'open_socius_today')
      .slice(1)
      .map(request => request.params?.arguments)
    button.click()
    expect(assessmentRequests()).toHaveLength(0)
    choose(stress, 'usual')
    choose(fatigue, 'higher')
    choose(sleep, 'worse')
    expect(form.checkValidity()).toBe(true)
    button.click()
    await vi.waitFor(() => expect(element('recommendation-title').textContent).toBe(easierGuidance.title))
    expect(element('recommendation-summary').textContent).toBe(easierGuidance.summary)
    expect(element('recommendation-reasons').textContent).toContain(easierGuidance.reasons[0])
    expect(element('recommendation-actions').textContent).toContain(easierGuidance.actions[0])
    expect(assessmentRequests()).toMatchObject([
      { tzOffset: expect.any(Number), checkIn: { stress: 'usual', fatigue: 'higher', sleep: 'worse' } },
    ])

    failNextAssessment()
    choose(fatigue, 'usual')
    choose(sleep, 'usual')
    expect(element('recommendation-title').textContent).toBe('')
    button.click()
    await vi.waitFor(() => expect(button.disabled).toBe(false))
    expect(element('check-in-status').textContent).toMatch(/try again/i)
    expect(element('today-content').hidden).toBe(false)
    expect(fatigue.value).toBe('usual')
    expect(sleep.value).toBe('usual')

    button.click()
    await vi.waitFor(() => expect(element('recommendation-title').textContent).toBe(usualGuidance.title))
    expect(element('recommendation-reasons').textContent).toContain(usualGuidance.reasons[0])
    expect(element('recommendation-reasons').textContent).not.toContain(easierGuidance.reasons[0])
    expect(assessmentRequests().slice(1)).toMatchObject([
      { checkIn: { stress: 'usual', fatigue: 'usual', sleep: 'usual' } },
      { checkIn: { stress: 'usual', fatigue: 'usual', sleep: 'usual' } },
    ])
    expect(requests.filter(request => request.method === 'ui/message')).toHaveLength(0)
  })

  it('clears the previous check-in and reads the new day when the widget regains focus', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 20, 23, 59))
    const { widget, element, requests, setTodayDate } = mountWidget(initialRecommendation, Date)
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    const fields = ['stress', 'fatigue', 'sleep'].map(name => element('check-in-' + name) as HTMLSelectElement)
    for (const field of fields) choose(field, 'usual')
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
    expect(fields.map(field => field.value)).toEqual(['', '', ''])
    expect(workout.open).toBe(false)
    expect(requests.filter(request => request.params?.name === 'open_socius_today').at(-1)?.params?.arguments)
      .toEqual({ tzOffset: expect.any(Number) })
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
