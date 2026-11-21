// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sociusTodayHtml } from '../../app/lib/coach/today-app-ui'
import type { TodayWorkoutRecommendation } from '../../app/lib/coach/today-workout-recommendation'

const date = '2026-11-20'
const readAt = '2026-11-20T11:40:00.000Z'
const retiredControls = ['ask', 'activity-ask', 'workout-log', 'nutrition-log', 'chat-prompt', 'copy-prompt']

interface HostRequest {
  id?: number
  method: string
  params?: Record<string, unknown>
}

function mountWidget(workoutRecommendation: TodayWorkoutRecommendation) {
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  const child = iframe.contentWindow!
  const host = child.parent
  const widget = child.document
  const requests: HostRequest[] = []
  let mealCount = 0

  vi.spyOn(host, 'postMessage').mockImplementation((request: HostRequest) => {
    requests.push(request)
    if (request.id === undefined) return
    let result: unknown
    if (request.method === 'ui/initialize') {
      result = { hostCapabilities: { message: { text: {} }, experimental: { 'openai/message': {} } } }
    } else if (request.params?.name === 'open_socius_today') {
      result = { _meta: {
        today: { date, readAt, workoutRecommendation, sessions: workoutRecommendation.sessions,
          recentWork: [], recovery: { status: 'unavailable' } },
        activityEnabled: true,
        nutritionEnabled: true,
      } }
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
  }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('SociusFit dashboard', () => {
  it('leads Today with the saved recommendation and labels the accepted plan details', async () => {
    const { element } = mountWidget({
      status: 'recommended', source: 'saved_recommendation', title: 'Keep today easy',
      reason: 'Your saved review calls for recovery.',
      sessions: [{ title: 'Aerobic session', focus: 'Easy pace', status: 'planned', details: ['Bike · 20 min'] }],
    })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    expect(element('today-content').firstElementChild?.getAttribute('aria-labelledby')).toBe('sessions-title')
    expect(element('sessions-title').textContent).toBe('Recommended plan')
    expect(element('recommendation-title').textContent).toBe('Keep today easy')
    expect(element('sessions-note').textContent).toBe('Your saved review calls for recovery.')
    expect(element('accepted-plan-label').hidden).toBe(false)
    expect(element('sessions').textContent).toContain('Aerobic session')
    expect(element('sessions').textContent).toContain('Bike · 20 min')
  })

  it('loads Activity and refreshes Nutrition without exposing dashboard chat actions', async () => {
    const { widget, element, requests, setMealCount } = mountWidget({
      status: 'unscheduled', source: 'accepted_plan', title: 'No workout scheduled today', reason: null, sessions: [],
    })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    expect(element('recommendation-title').textContent).toBe('No workout scheduled today')
    expect(element('sessions').childElementCount).toBe(0)
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
