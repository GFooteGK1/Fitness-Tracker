// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sociusTodayHtml } from '../../app/lib/coach/today-app-ui'

const date = '2026-11-20'
const readAt = '2026-11-20T11:40:00.000Z'

interface HostRequest {
  id?: number
  method: string
  params?: Record<string, unknown>
}

function mountWidget({ supportsDraft = true, rejectsDraft = false, writesEnabled = true } = {}) {
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  const child = iframe.contentWindow!
  const host = child.parent
  const documentInWidget = child.document
  const requests: HostRequest[] = []
  let mealCount = 0

  vi.spyOn(host, 'postMessage').mockImplementation((request: HostRequest) => {
    requests.push(request)
    if (request.id === undefined) return
    let result: unknown
    if (request.method === 'ui/initialize') {
      result = { hostCapabilities: {
        message: { text: {} },
        experimental: supportsDraft ? { 'openai/message': {} } : {},
      } }
    } else if (request.method === 'ui/message') {
      result = { isError: rejectsDraft }
    } else if (request.params?.name === 'open_socius_today') {
      result = { _meta: {
        today: { date, readAt, sessions: [], recentWork: [], recovery: { status: 'unavailable' } },
        activityEnabled: true,
        nutritionEnabled: true,
        nutritionWritesEnabled: writesEnabled,
      } }
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

  documentInWidget.open()
  documentInWidget.write(sociusTodayHtml)
  documentInWidget.close()

  return {
    element: (id: string) => documentInWidget.getElementById(id)!,
    chatRequests: () => requests.filter(item => item.method === 'ui/message'),
    nutritionRequests: () => requests.filter(item => item.params?.name === 'read_socius_nutrition'),
    setMealCount: (count: number) => { mealCount = count },
  }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('SociusFit Today widget chat and logging', () => {
  it('prepares review and logging drafts in the active composer with explicit send', async () => {
    const { element, chatRequests } = mountWidget()
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    expect(element('workout-log-area').hidden).toBe(false)
    element('ask').click()
    element('workout-log').click()
    element('show-nutrition').click()
    await vi.waitFor(() => expect(element('nutrition-log-area').hidden).toBe(false))
    element('nutrition-log').click()

    expect(chatRequests().map(({ params }) => params)).toEqual([
      'Keep this read-only', 'log a workout I completed', 'log food I ate',
    ].map(text => ({
      role: 'user',
      content: [{ type: 'text', text: expect.stringContaining(text) }],
      _meta: { 'openai/message': { target: 'active', send: false } },
    })))
    await vi.waitFor(() => expect(element('nutrition-ask-status').textContent).toMatch(/send when ready/i))
    expect(element('nutrition-content').hidden).toBe(false)
  })

  it.each([
    { supportsDraft: false, rejectsDraft: false, requests: 0 },
    { supportsDraft: true, rejectsDraft: true, requests: 1 },
  ])('gives composer instructions when a draft cannot be set ($requests requests)', async options => {
    const { element, chatRequests } = mountWidget(options)
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    element('ask').click()
    await vi.waitFor(() => expect(element('ask-status').textContent).toContain('Use this chat’s composer'))
    expect(chatRequests()).toHaveLength(options.requests)
    expect(element('today-content').hidden).toBe(false)
  })

  it('re-reads saved nutrition totals without offering logs on a read-only connection', async () => {
    const { element, chatRequests, nutritionRequests, setMealCount } = mountWidget({ writesEnabled: false })
    await vi.waitFor(() => expect(element('today-content').hidden).toBe(false))
    expect(element('workout-log-area').hidden).toBe(true)
    element('show-nutrition').click()
    await vi.waitFor(() => expect(element('nutrition-refresh').hidden).toBe(false))
    expect(element('nutrition-log-area').hidden).toBe(true)
    expect(element('nutrition-meal-count').textContent).toBe('0 saved meals')

    setMealCount(1)
    element('nutrition-refresh').click()
    await vi.waitFor(() => expect(element('nutrition-meal-count').textContent).toBe('1 saved meal'))
    expect(element('nutrition-progress').textContent).toContain('30 g logged')
    expect(nutritionRequests()).toHaveLength(2)
    expect(chatRequests()).toHaveLength(0)
  })
})
