import { localDateToUTCStart, formatUTCAsLocalDateWithOffset } from '@/app/lib/timezone-utils'
import type { ActivityKind } from './contracts'
import { CaptureError } from './service'

const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const rounded = (value: number) => Math.round(value * 1000) / 1000

/** Missing quantities remain missing. Derived projections use only represented amounts, never policy defaults. */
export function normalizeActivity(kind: ActivityKind, input: Record<string, unknown>): { record: Record<string, unknown>; blocks: Record<string, unknown>[] } {
  const allowed = kind === 'meal'
    ? ['meal_timestamp','meal_timing','items','total_protein','total_carbs','total_fat','total_calories','needs_review','ai_confidence','input_text','manual_override','reviewed_at','source_meal_id','entry_method']
    : ['workout_date','input_text','blocks','primary_score','total_duration_min','tags','notes','rpe','reported_rpe','parse_confidence']
  const record: Record<string, unknown> = Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key)))
  record.photo_url = null
  if (kind === 'meal') {
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) throw new CaptureError('At least one food item is required.', '22023')
    const items = input.items.map(item => {
      const food = object(item)
      if (typeof food.food !== 'string' || !food.food.trim() || typeof food.portion !== 'string' || !food.portion.trim()
        || !['protein','carbs','fat','calories'].every(key => numeric(food[key]))) throw new CaptureError('Review the food and estimated quantities before saving.', '22023')
      return food
    })
    for (const key of ['protein','carbs','fat','calories']) record[`total_${key}`] = rounded(items.reduce((sum, item) => sum + Number(item[key]), 0))
    record.items = items
    if (typeof input.meal_timestamp !== 'string' || !Number.isFinite(Date.parse(input.meal_timestamp))) throw new CaptureError('Choose when this meal occurred.', '22023')
    return { record, blocks: [] }
  }
  delete record.photo_url
  if (typeof input.workout_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.workout_date)) throw new CaptureError('Choose the workout date.', '22023')
  if (formatUTCAsLocalDateWithOffset(localDateToUTCStart(input.workout_date, 0), 0) !== input.workout_date) throw new CaptureError('Choose a valid workout date.', '22023')
  if (!Array.isArray(input.blocks) || !input.blocks.length || input.blocks.length > 100) throw new CaptureError('At least one workout block is required.', '22023')
  // The old integer column cannot represent half-point effort. The source record and provenance retain it.
  if (record.rpe !== null && record.rpe !== undefined && (!numeric(record.rpe) || Number(record.rpe) > 10)) throw new CaptureError('Invalid session effort.', '22023')
  if (numeric(record.rpe)) record.reported_rpe = record.rpe
  record.rpe = Number.isInteger(record.rpe) ? record.rpe : null
  const blocks = input.blocks.map(raw => {
    const block = object(raw)
    const type = block.block_type ?? block.type
    if (!['AMRAP','FOR_TIME','EMOM','STRENGTH','CARDIO'].includes(String(type))) throw new CaptureError('Unsupported workout block.', '22023')
    const score = object(block.block_score ?? block.score)
    let reps: number | null = null
    let tonnage: number | null = null
    const movements = Array.isArray(block.movements) ? block.movements.map(object) : []
    if (movements.length && movements.every(m => numeric(m.reps) && m.sets === undefined)) {
      const perRound = movements.reduce((sum, m) => sum + Number(m.reps), 0)
      const rounds = score.rounds_completed ?? score.rounds
      reps = numeric(rounds) ? rounds * perRound + (numeric(score.extra_reps) ? score.extra_reps : 0) : perRound
      const weights = movements.map(m => typeof m.weight === 'string' ? /^\s*(\d+(?:\.\d+)?)\s*(lb|kg|#)\s*$/i.exec(m.weight) : null)
      if (weights.every(Boolean)) tonnage = rounded(movements.reduce((sum, m, index) => {
        const weight = weights[index]!
        return sum + Number(m.reps) * Number(weight[1]) * (weight[2].toLowerCase() === 'kg' ? 2.2046226218 : 1)
      }, 0) * (numeric(rounds) ? rounds : 1))
    }
    return { block_type: type, block_title: typeof block.title === 'string' ? block.title : null,
      rounds_completed: numeric(score.rounds_completed ?? score.rounds) ? score.rounds_completed ?? score.rounds : null,
      extra_reps: numeric(score.extra_reps) ? score.extra_reps : null,
      time_s: numeric(score.time_s) ? score.time_s : null,
      total_reps: reps, tonnage_lb: tonnage, rx_status: ['RX','SCALED'].includes(String(block.rx_status ?? score.rx_status)) ? block.rx_status ?? score.rx_status : null,
      is_pr: false }
  })
  return { record, blocks }
}
