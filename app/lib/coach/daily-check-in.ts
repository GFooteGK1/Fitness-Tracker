import type { SupabaseClient } from '@supabase/supabase-js'

const relativeChoices = ['lower', 'usual', 'higher'] as const
const sleepChoices = ['worse', 'usual', 'better'] as const
const relativeField = { type: 'string', enum: relativeChoices } as const
const checkInFields = ['stress', 'fatigue', 'sleep', 'soreness', 'motivation'] as const
const ratingField = { type: 'integer', minimum: 1, maximum: 5 } as const

export const dailyCheckInSchema = {
  type: 'object',
  properties: {
    stress: ratingField,
    fatigue: ratingField,
    sleep: ratingField,
    soreness: ratingField,
    motivation: ratingField,
  },
  required: checkInFields,
  additionalProperties: false,
} as const

export const legacyDailyCheckInSchema = {
  type: 'object',
  properties: {
    stress: relativeField,
    fatigue: relativeField,
    sleep: { type: 'string', enum: sleepChoices },
    soreness: relativeField,
    motivation: relativeField,
  },
  required: checkInFields,
  additionalProperties: false,
} as const

type CheckInField = typeof checkInFields[number]
type Rating = 1 | 2 | 3 | 4 | 5
export type DailyCheckIn = Record<CheckInField, Rating>
export type LegacyDailyCheckIn = {
  [Field in CheckInField]: typeof legacyDailyCheckInSchema.properties[Field]['enum'][number]
}

export type DailyCheckInRead =
  | { status: 'saved'; scale: '1-to-5'; checkIn: DailyCheckIn }
  | { status: 'saved'; scale: 'relative-to-usual'; checkIn: LegacyDailyCheckIn }
  | { status: 'missing' }
  | { status: 'unavailable' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isChoice<T extends string>(choices: readonly T[], value: unknown): value is T {
  return choices.some(choice => choice === value)
}

function hasFiveFields(value: unknown): value is Record<CheckInField, unknown> {
  return isRecord(value) && Object.keys(value).length === checkInFields.length
    && checkInFields.every(field => Object.hasOwn(value, field))
}

function isRating(value: unknown): value is Rating {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5
}

export function parseDailyCheckIn(value: unknown): DailyCheckIn | null {
  if (!hasFiveFields(value)) return null
  const { stress, fatigue, sleep, soreness, motivation } = value
  return isRating(stress) && isRating(fatigue) && isRating(sleep) && isRating(soreness) && isRating(motivation)
    ? { stress, fatigue, sleep, soreness, motivation } : null
}

export function parseLegacyDailyCheckIn(value: unknown): LegacyDailyCheckIn | null {
  if (!hasFiveFields(value)) return null
  const { stress, fatigue, sleep, soreness, motivation } = value
  if (!isChoice(relativeChoices, stress) || !isChoice(relativeChoices, fatigue)
    || !isChoice(sleepChoices, sleep) || !isChoice(relativeChoices, soreness)
    || !isChoice(relativeChoices, motivation)) return null
  return { stress, fatigue, sleep, soreness, motivation }
}

export function toLegacyDailyCheckIn({ stress, fatigue, sleep, soreness, motivation }: DailyCheckIn): LegacyDailyCheckIn {
  const symptoms = (rating: Rating) => rating < 3 ? 'higher' : rating > 3 ? 'lower' : 'usual'
  return {
    stress: symptoms(stress),
    fatigue: symptoms(fatigue),
    sleep: sleep < 3 ? 'worse' : sleep > 3 ? 'better' : 'usual',
    soreness: symptoms(soreness),
    motivation: motivation < 3 ? 'lower' : motivation > 3 ? 'higher' : 'usual',
  }
}

const table = 'coach_daily_checkins'
const columns = 'user_id,local_date,stress,fatigue,sleep,soreness,motivation,stress_rating,fatigue_rating,sleep_rating,soreness_rating,motivation_rating'

function parseSavedCheckIn(row: unknown, owner: string, date: string): Extract<DailyCheckInRead, { status: 'saved' }> | null {
  if (!isRecord(row) || row.user_id !== owner || row.local_date !== date) return null
  const ratings = { stress: row.stress_rating, fatigue: row.fatigue_rating, sleep: row.sleep_rating,
    soreness: row.soreness_rating, motivation: row.motivation_rating }
  const values = Object.values(ratings)
  if (!values.every(value => value === null) && !values.every(value => value === undefined)) {
    const checkIn = parseDailyCheckIn(ratings)
    return checkIn ? { status: 'saved', scale: '1-to-5', checkIn } : null
  }
  const { stress, fatigue, sleep, soreness, motivation } = row
  const checkIn = parseLegacyDailyCheckIn({ stress, fatigue, sleep, soreness, motivation })
  return checkIn ? { status: 'saved', scale: 'relative-to-usual', checkIn } : null
}

export async function readDailyCheckIn(db: SupabaseClient, owner: string, date: string): Promise<DailyCheckInRead> {
  try {
    const { data, error } = await db.from(table).select(columns)
      .eq('user_id', owner).eq('local_date', date).limit(2)
    if (error || !Array.isArray(data) || data.length > 1) return { status: 'unavailable' }
    if (data.length === 0) return { status: 'missing' }
    return parseSavedCheckIn(data[0], owner, date) ?? { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}

/** The caller verifies the athlete identity and supplies their current local date. */
export async function saveDailyCheckIn(db: SupabaseClient, owner: string, date: string, checkIn: DailyCheckIn | LegacyDailyCheckIn) {
  const ratings = parseDailyCheckIn(checkIn)
  const legacy = ratings ? toLegacyDailyCheckIn(ratings) : parseLegacyDailyCheckIn(checkIn)
  if (!legacy) throw new Error('Invalid daily check-in')
  // An unchanged legacy submission preserves any exact ratings already saved.
  const ratingColumns = ratings ? {
    stress_rating: ratings.stress, fatigue_rating: ratings.fatigue, sleep_rating: ratings.sleep,
    soreness_rating: ratings.soreness, motivation_rating: ratings.motivation,
  } : {}
  try {
    const { data, error } = await db.from(table)
      .upsert({ ...legacy, ...ratingColumns, user_id: owner, local_date: date }, { onConflict: 'user_id,local_date' })
      .select(columns).single()
    const saved = error ? null : parseSavedCheckIn(data, owner, date)
    if (saved?.scale === '1-to-5') {
      const answers = ratings ? saved.checkIn : toLegacyDailyCheckIn(saved.checkIn)
      if (checkInFields.every(field => answers[field] === checkIn[field])) return answers
    } else if (!ratings && saved && checkInFields.every(field => saved.checkIn[field] === legacy[field])) {
      return saved.checkIn
    }
  } catch {
    // A failed response may leave the save status unknown. The caller can read it back.
  }
  throw new Error('Could not confirm that today’s check-in was saved')
}
