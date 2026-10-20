import { describe, expect, it } from 'vitest'
import { externalEstimateFingerprint, parseExternalImport, strictEstimateJson, validateExternalEstimate } from '@/app/lib/nutrition/external-estimate'

const fixture = () => ({ schemaVersion: 1, capture: { requestId: '10000000-0000-4000-8000-000000000001', capturedAt: '2026-10-20T12:00:00Z', contentHash: 'a'.repeat(64) },
  estimate: { items: [{ food: 'Synthetic food', portion: '1 unit', protein: 0.1, carbs: 0.2, fat: 1, calories: 20 }, { food: 'Fixture', portion: '1 unit', protein: 0.2, carbs: 0.1, fat: 0, calories: 10 }],
    totals: { protein: 0.3, carbs: 0.3, fat: 1, calories: 30 }, estimatedAt: '2026-10-20T12:00:01Z', model: 'unverified-model-label' } })
describe('strict external estimate contract', () => {
  it('accepts decimal sums and canonicalizes source timestamps', () => {
    const input = fixture(), parsed = parseExternalImport(JSON.stringify({ schemaVersion: 1, capture: input.capture, estimateJSON: JSON.stringify(input.estimate) }))
    expect(parsed.capture.capturedAt).toBe('2026-10-20T12:00:00.000Z')
    expect(parsed.estimate.totals.protein).toBe(0.3)
  })
  it('fingerprints semantic JSON consistently while binding all material estimate and capture facts', () => {
    const valid = validateExternalEstimate(fixture())
    expect(externalEstimateFingerprint({ estimate: valid.estimate, capture: valid.capture, schemaVersion: 1 })).toBe(externalEstimateFingerprint(valid))
    for (const changed of [{ ...valid, capture: { ...valid.capture, contentHash: 'b'.repeat(64) } }, { ...valid, estimate: { ...valid.estimate, model: 'different' } }]) {
      expect(externalEstimateFingerprint(changed)).not.toBe(externalEstimateFingerprint(valid))
    }
  })
  it.each(['```json\n{}\n```', 'Estimate: {}', '[]', 'null', '{} {}', '1e999'])('rejects unsupported root or surrounding text %s', value => {
    expect(() => validateExternalEstimate(strictEstimateJson(value))).toThrow()
  })
  it.each(['{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '{"nested":[{"x":1,"x":2}]}'])('rejects duplicate decoded keys before conversion %s', value => {
    expect(() => strictEstimateJson(value)).toThrow()
  })
  it('does not confuse escaped quote characters or strings for object keys', () => {
    expect(strictEstimateJson('{"x":"\\\"x\\\":1","y":[{"x":1},{"x":2}]}')).toEqual({ x: '"x":1', y: [{ x: 1 }, { x: 2 }] })
  })
  it.each([NaN, Infinity, -1, '1', null, true, 0.0001, 0.00000000001, 10001])('rejects unsupported estimated number %s', quantity => {
    const input = fixture(); (input.estimate.items[0] as Record<string, unknown>).calories = quantity
    expect(() => validateExternalEstimate(input)).toThrow()
  })
  it('rejects disagreements instead of silently replacing supplied totals', () => {
    const input = fixture(); input.estimate.totals.protein = 0.301
    expect(() => validateExternalEstimate(input)).toThrow()
  })
  it.each(['userId', 'consumed', 'provenance', 'canonicalChanged'])('rejects authority upgrades %s', key => {
    expect(() => validateExternalEstimate({ ...fixture(), [key]: true })).toThrow()
    const input = fixture(); expect(() => validateExternalEstimate({ ...input, estimate: { ...input.estimate, [key]: true } })).toThrow()
  })
  it('rejects invalid calendar/time/hash/identity and excessive metadata', () => {
    for (const capture of [{ ...fixture().capture, capturedAt: '2026-02-30T12:00:00Z' }, { ...fixture().capture, requestId: 'wrong' }, { ...fixture().capture, contentHash: 'a'.repeat(63) }]) {
      expect(() => validateExternalEstimate({ ...fixture(), capture })).toThrow()
    }
    const input = fixture(); input.estimate.items[0].food = 'a'.repeat(257); expect(() => validateExternalEstimate(input)).toThrow()
  })
  it('bounds recursion, raw bytes, item count, aggregate quantities and nested estimate syntax', () => {
    expect(() => strictEstimateJson('['.repeat(14) + '0' + ']'.repeat(14))).toThrow()
    expect(() => strictEstimateJson(' '.repeat(65537) + '{}')).toThrow()
    const input = fixture(); input.estimate.items = Array.from({ length: 21 }, () => input.estimate.items[0]); expect(() => validateExternalEstimate(input)).toThrow()
    const excessive = fixture(); excessive.estimate.items = Array.from({ length: 3 }, () => ({ food: 'Fixture', portion: '1 unit', protein: 500, carbs: 0, fat: 0, calories: 1 })); excessive.estimate.totals = { protein: 1500, carbs: 0, fat: 0, calories: 3 }
    expect(() => validateExternalEstimate(excessive)).toThrow()
    expect(() => parseExternalImport(JSON.stringify({ schemaVersion: 1, capture: fixture().capture, estimateJSON: '```json {} ```' }))).toThrow()
  })
})
