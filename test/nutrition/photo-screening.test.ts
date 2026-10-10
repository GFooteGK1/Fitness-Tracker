import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parsePhotoScreening, photoScreeningRequest, screenMealPhoto, PHOTO_SCREENING_MODEL } from '@/app/lib/nutrition/photo-screening'

const wire = (choice = 'food', confidence = 1, selected = 1) => ({ model: PHOTO_SCREENING_MODEL, answers: [{ name: 'food_screen', type: 'choice', choice, confidence,
  probabilities: ['food','non_food','uncertain'].map(value => ({ value, probability: value === choice ? selected : (1 - selected) / 2 })) }] })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('qualified photo screening contract', () => {
  it('retains the frozen qualification request byte-for-byte for JPEG', () => {
    expect(createHash('sha256').update(JSON.stringify(photoScreeningRequest('', 'image/jpeg'))).digest('hex')).toBe('7062a2347820055a75249b620e48b78a90f0bea13dd070b5258f1a78f2b1e5fd')
    expect(photoScreeningRequest('YWJj', 'image/png').input[0].content[1]).toEqual({ type: 'input_image', image_url: 'data:image/png;base64,YWJj' })
  })
  it.each([['food',0.9,0.9,'food_candidate'],['non_food',0.9,0.9,'non_food_candidate'],['food',0.899,1,'review'],['food',1,0.899,'review'],['uncertain',1,1,'review']])('gates %s with confidence %s and probability %s', (choice, confidence, selected, route) => {
    expect(parsePhotoScreening(wire(String(choice), Number(confidence), Number(selected))).route).toBe(route)
  })
  it.each([
    { ...wire(), model: 'other' }, { ...wire(), answers: [] }, { ...wire(), answers: [wire().answers[0],wire().answers[0]] },
    { model: PHOTO_SCREENING_MODEL, answers: [{ name: 'food_screen', type: 'refusal' }] },
    { model: PHOTO_SCREENING_MODEL, answers: [{ ...wire().answers[0], name: 'other' }] },
    wire('unknown'), wire('food',NaN), wire('food',Infinity), wire('food',-1), wire('food',1.01),
    { model: PHOTO_SCREENING_MODEL, answers: [{ ...wire().answers[0], probabilities: [null,null,null] }] },
    { model: PHOTO_SCREENING_MODEL, answers: [{ ...wire().answers[0], probabilities: [{ value: 'food', probability: 1 },{ value: 'food', probability: 0 },{ value: 'uncertain', probability: 0 }] }] },
    { model: PHOTO_SCREENING_MODEL, answers: [{ ...wire().answers[0], probabilities: [{ value: 'food', probability: 1 },{ value: 'non_food', probability: 0.1 },{ value: 'uncertain', probability: 0 }] }] },
    { model: PHOTO_SCREENING_MODEL, answers: [{ ...wire().answers[0], probabilities: [{ value: 'food', probability: 0.5 },{ value: 'non_food', probability: 0.5 },{ value: 'uncertain', probability: 0 }] }] },
    { model: PHOTO_SCREENING_MODEL, answers: [{ ...wire().answers[0], probabilities: [{ value: 'food', probability: 0.1 },{ value: 'non_food', probability: 0.9 },{ value: 'uncertain', probability: 0 }] }] },
  ])('rejects untrusted or inconsistent output %#', data => { expect(() => parsePhotoScreening(data)).toThrow('Photo screening is unavailable.') })
  it('sanitizes successful wire output and performs one fixed bounded call', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'unit-only-secret')
    const send = vi.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify({ ...wire(), private: 'do not persist', answers: [{ ...wire().answers[0], raw: 'data:image/jpeg;base64,private' }] })))
    vi.stubGlobal('fetch', send)
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const result = await screenMealPhoto({ base64Image: 'YWJj', mediaType: 'image/jpeg' })
    expect(result.route).toBe('food_candidate'); expect(JSON.stringify(result)).not.toMatch(/private|unit-only-secret|base64/)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]).toEqual(['https://api.openai.com/v1/decisions', expect.objectContaining({ method: 'POST', redirect: 'error', signal: expect.any(AbortSignal) })])
    expect(timeout).toHaveBeenCalledWith(45000)
  })
  it.each(['http','invalid_json','oversized','transport'])('fails %s without retry or leaking provider content', async mode => {
    vi.stubEnv('OPENAI_API_KEY', 'unit-only-secret')
    const send = vi.fn(async () => {
      if (mode === 'transport') throw new Error('unit-only-secret private image')
      return new Response(mode === 'oversized' ? 'x'.repeat(65537) : 'unit-only-secret private image', { status: mode === 'http' ? 429 : 200 })
    })
    vi.stubGlobal('fetch', send)
    await expect(screenMealPhoto({ base64Image: 'YWJj', mediaType: 'image/jpeg' })).rejects.toThrow(/^Photo screening is unavailable\.$/)
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('fails before transport when no server key is configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const send = vi.fn(); vi.stubGlobal('fetch', send)
    await expect(screenMealPhoto({ base64Image: 'YWJj', mediaType: 'image/jpeg' })).rejects.toThrow('Photo screening is unavailable.')
    expect(send).not.toHaveBeenCalled()
  })
})
