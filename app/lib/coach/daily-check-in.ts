import type { SupabaseClient } from '@supabase/supabase-js'

const relativeChoices = ['lower', 'usual', 'higher'] as const
const sleepChoices = ['worse', 'usual', 'better'] as const
const relativeField = { type: 'string', enum: relativeChoices } as const

export const dailyCheckInSchema = {
  type: 'object',
  properties: {
    stress: relativeField,
    fatigue: relativeField,
    sleep: { type: 'string', enum: sleepChoices },
    soreness: relativeField,
    motivation: relativeField,
  },
  required: ['stress', 'fatigue', 'sleep', 'soreness', 'motivation'],
  additionalProperties: false,
} as const

type CheckInField = keyof typeof dailyCheckInSchema.properties
export type DailyCheckIn = {
  [Field in CheckInField]: typeof dailyCheckInSchema.properties[Field]['enum'][number]
}

export type DailyCheckInRead =
  | { status: 'saved'; checkIn: DailyCheckIn }
  | { status: 'missing' }
  | { status: 'unavailable' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isChoice<T extends string>(choices: readonly T[], value: unknown): value is T {
  return choices.some(choice => choice === value)
}

export function parseDailyCheckIn(value: unknown): DailyCheckIn | null {
  if (!isRecord(value) || Object.keys(value).length !== dailyCheckInSchema.required.length
    || !dailyCheckInSchema.required.every(field => Object.hasOwn(value, field))) return null
  const { stress, fatigue, sleep, soreness, motivation } = value
  if (!isChoice(relativeChoices, stress) || !isChoice(relativeChoices, fatigue)
    || !isChoice(sleepChoices, sleep) || !isChoice(relativeChoices, soreness)
    || !isChoice(relativeChoices, motivation)) return null
  return { stress, fatigue, sleep, soreness, motivation }
}

const table = 'coach_daily_checkins'
const columns = 'user_id,local_date,stress,fatigue,sleep,soreness,motivation'

function parseSavedCheckIn(row: unknown, owner: string, date: string): DailyCheckIn | null {
  if (!isRecord(row) || row.user_id !== owner || row.local_date !== date) return null
  const { stress, fatigue, sleep, soreness, motivation } = row
  return parseDailyCheckIn({ stress, fatigue, sleep, soreness, motivation })
}

export async function readDailyCheckIn(db: SupabaseClient, owner: string, date: string): Promise<DailyCheckInRead> {
  try {
    const { data, error } = await db.from(table).select(columns)
      .eq('user_id', owner).eq('local_date', date).limit(2)
    if (error || !Array.isArray(data) || data.length > 1) return { status: 'unavailable' }
    if (data.length === 0) return { status: 'missing' }
    const checkIn = parseSavedCheckIn(data[0], owner, date)
    return checkIn ? { status: 'saved', checkIn } : { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}

/** The caller verifies the athlete identity and supplies their current local date. */
export async function saveDailyCheckIn(db: SupabaseClient, owner: string, date: string, checkIn: DailyCheckIn): Promise<DailyCheckIn> {
  try {
    const { data, error } = await db.from(table)
      .upsert({ ...checkIn, user_id: owner, local_date: date }, { onConflict: 'user_id,local_date' })
      .select(columns).single()
    const saved = error ? null : parseSavedCheckIn(data, owner, date)
    if (saved && dailyCheckInSchema.required.every(field => saved[field] === checkIn[field])) return saved
  } catch {
    // A failed response may leave the save status unknown. The caller can read it back.
  }
  throw new Error('Could not confirm that today’s check-in was saved')
}
