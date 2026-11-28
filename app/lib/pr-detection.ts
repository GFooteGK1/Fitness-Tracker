export const REP_MAX_TYPES = ['1rm', '3rm', '5rm'] as const

export type RepMaxType = typeof REP_MAX_TYPES[number]

export interface PRResult {
  isPR: boolean
  prType: RepMaxType
  previousBest: number
  newRecord: number
  exercise: string
}

export const personalRecordLabels: Record<RepMaxType, string> = {
  '1rm': '1RM',
  '3rm': '3RM',
  '5rm': '5RM',
}

export function isRepMaxType(value: string): value is RepMaxType {
  return REP_MAX_TYPES.some(type => type === value)
}

export function formatPRValue(value: number): string {
  return `${value} lbs`
}
