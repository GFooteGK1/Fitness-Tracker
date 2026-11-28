import { describe, expect, it } from 'vitest'
import { formatPRValue, isRepMaxType, personalRecordLabels } from '@/app/lib/pr-detection'

describe('rep-max presentation', () => {
  it.each([
    ['1rm', '1RM'],
    ['3rm', '3RM'],
    ['5rm', '5RM'],
  ] as const)('labels the %s record %s', (type, label) => {
    expect(isRepMaxType(type)).toBe(true)
    expect(personalRecordLabels[type]).toBe(label)
  })

  it('accepts only the supported rep-max types', () => {
    for (const type of ['weight', 'reps', 'time', 'volume', '2rm']) {
      expect(isRepMaxType(type)).toBe(false)
    }
  })

  it('formats a converted load in pounds without rounding away precision', () => {
    expect(formatPRValue(220.46)).toBe('220.46 lbs')
  })
})
