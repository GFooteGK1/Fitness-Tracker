import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mcpActivityFixture } from './mcp-activity-fixture'
import { sqlFile } from './fixture'

const migration = 'supabase/migrations/20261128031405_personal_record_rep_maxes.sql'
const owner = randomUUID()
const otherOwner = randomUUID()
type Evidence = { origin: string; reviewState: string; sourceReferences: string[] }
type Provenance = { schemaVersion: number; occurrence: Evidence; fields: Record<string, Evidence> }
const quantities: Evidence = { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [] }
const verified: Provenance = { schemaVersion: 1, occurrence: quantities, fields: { quantities } }

let db: PGlite
let priorBenchId: string
let legacyRecordId: string

function event(movement_name: string, reps: number, value: number, unit = 'lb') {
  return { movement_name, performed: { reps, load: { value, unit } } }
}

function workout(workout_date: string, ...events: unknown[]) {
  return {
    workout_date,
    input_text: 'Synthetic confirmed workout',
    blocks: [{ block_type: 'STRENGTH', segments: [{ rounds: 1, events }] }],
  }
}

async function actor(id: string) {
  await db.exec('SET ROLE authenticated')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id])
}

async function save(record: ReturnType<typeof workout>, provenance = verified) {
  const request = (await db.query<{ request: { id: string } }>(
    'SELECT public.begin_logging_request($1,$2) AS request', [randomUUID(), 'a'.repeat(64)],
  )).rows[0].request
  const options = [{ sourceItemId: 'exercise:test', kind: 'workout', inputMethod: 'text',
    eventAt: record.workout_date, eventPrecision: 'date', record, blocks: [{}], provenance }]
  const frozen = (await db.query<{ items: { id: string }[] }>(
    'SELECT public.freeze_logging_request_items($1,$2::jsonb) AS items', [request.id, JSON.stringify(options)],
  )).rows[0].items
  return (await db.query<{ receipt: { entityId: string } }>(
    'SELECT public.commit_logging_request_item($1) AS receipt', [frozen[0].id],
  )).rows[0].receipt.entityId
}

async function amend(id: string, revision: number, record: ReturnType<typeof workout>, provenance = verified) {
  return (await db.query<{ receipt: { projectionsStatus: string } }>(
    'SELECT public.amend_logged_activity($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) AS receipt',
    ['workout', id, revision, randomUUID(), JSON.stringify(record), '[{}]', JSON.stringify(provenance)],
  )).rows[0].receipt
}

async function records() {
  return (await db.query<{
    workout_id: string; exercise: string; pr_type: string; value: string; previous_value: string | null; day: string
  }>(`
    SELECT workout_id, exercise, pr_type, value, previous_value,
      (achieved_at AT TIME ZONE 'UTC')::date::text AS day
    FROM public.personal_records
    WHERE pr_type IN ('1rm', '3rm', '5rm')
    ORDER BY exercise, pr_type, day
  `)).rows
}

beforeAll(async () => {
  db = await mcpActivityFixture()
  await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [owner, otherOwner])
  await actor(owner)
  priorBenchId = await save(workout('2026-11-17', event('Bench Press', 5, 185)))
  legacyRecordId = (await db.query<{ id: string }>(
    "SELECT id FROM public.personal_records WHERE workout_id=$1 AND pr_type='volume'", [priorBenchId],
  )).rows[0].id

  await actor(otherOwner)
  await save(workout('2026-11-17', event('Bench Press', 5, 400)))

  await db.exec('RESET ROLE')
  const unproven = workout('2026-11-16', event('Bench Press', 5, 450))
  await db.query(
    'INSERT INTO public.workouts (user_id, workout_date, input_text, blocks) VALUES ($1,$2,$3,$4::jsonb)',
    [owner, unproven.workout_date, unproven.input_text, JSON.stringify(unproven.blocks)],
  )
  await db.exec("SET TIME ZONE 'America/Chicago'")
  await db.exec(sqlFile(migration))
  await db.exec(sqlFile(migration))
}, 30000)

afterAll(async () => { await db?.close() })

describe('exact rep-max projection', () => {
  it('backfills completed, reported sets once and preserves pre-existing legacy rows and owner isolation', async () => {
    await actor(owner)
    expect(await records()).toEqual([{
      workout_id: priorBenchId, exercise: 'Bench Press', pr_type: '5rm',
      value: '185.00', previous_value: null, day: '2026-11-17',
    }])
    expect((await db.query('SELECT id FROM public.personal_records WHERE id=$1', [legacyRecordId])).rows)
      .toEqual([{ id: legacyRecordId }])
    await expect(db.query(`
      INSERT INTO public.personal_records (user_id, exercise, pr_type, value, workout_id)
      VALUES ($1, 'Bench Press', '1rm', 500, $2)
    `, [owner, priorBenchId])).rejects.toThrow('row-level security')
    expect((await db.query("DELETE FROM public.personal_records WHERE workout_id=$1 AND pr_type='5rm' RETURNING id",
      [priorBenchId])).rows).toEqual([])
    const legacyInsert = await db.query<{ id: string }>(`
      INSERT INTO public.personal_records (user_id, exercise, pr_type, value, workout_id)
      VALUES ($1, 'Synthetic historical benchmark', 'time', 180, $2) RETURNING id
    `, [owner, priorBenchId])
    expect((await db.query('DELETE FROM public.personal_records WHERE id=$1 RETURNING id',
      [legacyInsert.rows[0].id])).rows).toEqual(legacyInsert.rows)
    await expect(db.query('SELECT * FROM public.capture_rep_max_history(NULL,NULL,NULL)'))
      .rejects.toThrow('permission denied')
    await actor(otherOwner)
    expect(await records()).toEqual([expect.objectContaining({ exercise: 'Bench Press', value: '400.00' })])
  })

  it('keeps each power lift separate, merges paused bench and ignores nonqualifying or estimated sets', async () => {
    await actor(owner)
    const logged = workout('2026-11-18',
      { movement_name: 'Paused Bench Press', performed: {
        reps: 1, load: { value: 900, unit: 'lb' },
        set_details: [
          { reps: 5, load: { value: 90, unit: 'kg' } },
          { reps: 3, load: { value: 200, unit: 'lb' } },
          { reps: 3, load: { value: 207, unit: 'lb' } },
          { reps: 1, load: { value: 500, unit: 'unknown' } },
          { reps: 6, load: { value: 900, unit: 'lb' } },
        ],
      } },
      event('Squat Clean', 1, 220),
      event('PC', 1, 190),
      event('Power C&J', 3, 150),
      event('C&J', 3, 175),
      event('Snatch', 5, 80),
      event('Power Snatch', 5, 85),
      event('Back Squat', 1, 350),
      event('Hang Power Clean', 1, 350),
      event('Dumbbell Bench Press', 1, 350),
      { movement_name: 'Strict Press', performed: { sets: [{ reps: 5, load: { value: 65, unit: 'lbs' } }] } },
      { movement_name: 'Overhead Squat', prescribed: { reps: 5, load: { value: 100, unit: 'lb' } }, performed: {} },
      event('Push Press', 1, 210),
      event('OHS', 3, 100),
      event('Split Jerk', 3, 155),
      event('Push Press', 1, 135),
    )
    const written = await save(logged, {
      ...verified,
      fields: { ...verified.fields, 'blocks[0].segments[0].events[12].performed.load.value': {
        ...quantities, origin: 'model_estimated',
      } },
    })
    expect((await records()).filter(row => row.workout_id === written)).toEqual([
      expect.objectContaining({ exercise: 'Bench Press', pr_type: '3rm', value: '207.00', previous_value: null }),
      expect.objectContaining({ exercise: 'Bench Press', pr_type: '5rm', value: '198.42', previous_value: '185.00' }),
      expect.objectContaining({ exercise: 'Clean', pr_type: '1rm', value: '220.00' }),
      expect.objectContaining({ exercise: 'Clean and Jerk', pr_type: '3rm', value: '175.00' }),
      expect.objectContaining({ exercise: 'Jerk', pr_type: '3rm', value: '155.00' }),
      expect.objectContaining({ exercise: 'Overhead Squat', pr_type: '3rm', value: '100.00' }),
      expect.objectContaining({ exercise: 'Power Clean', pr_type: '1rm', value: '190.00' }),
      expect.objectContaining({ exercise: 'Power Clean and Jerk', pr_type: '3rm', value: '150.00' }),
      expect.objectContaining({ exercise: 'Power Snatch', pr_type: '5rm', value: '85.00' }),
      expect.objectContaining({ exercise: 'Push Press', pr_type: '1rm', value: '135.00' }),
      expect.objectContaining({ exercise: 'Snatch', pr_type: '5rm', value: '80.00' }),
      expect.objectContaining({ exercise: 'Strict Press', pr_type: '5rm', value: '65.00' }),
    ])
    expect((await db.query(
      "SELECT id FROM public.personal_records WHERE workout_id=$1 AND pr_type IN ('weight','reps','volume','time')", [written],
    )).rows).toEqual([])
  })

  it('recalculates affected progression after correction and deletion', async () => {
    await actor(owner)
    const baseline = await save(workout('2026-11-18', event('Front Squat', 5, 185)))
    const preceding = await save(workout('2026-11-19', event('FS', 5, 198)))
    const written = await save(workout('2026-11-20', event('Front Squat', 5, 205)))
    const later = await save(workout('2026-11-21', event('Front Squat', 5, 210)))
    const tie = await save(workout('2026-11-22', event('Front Squat', 5, 210)))
    const correction = workout('2026-11-20', event('Front Squat', 5, 190))
    await amend(written, 1, correction)

    const frontSquatRecords = async () => (await records()).filter(row => row.exercise === 'Front Squat' && row.pr_type === '5rm')
    const corrected = await frontSquatRecords()
    expect(corrected.some(row => row.workout_id === written || row.workout_id === tie)).toBe(false)
    expect(corrected.find(row => row.workout_id === later)?.previous_value).toBe('198.00')

    await db.query('SELECT public.delete_logged_activity($1,$2,$3,$4)', ['workout', preceding, 1, randomUUID()])
    expect((await frontSquatRecords()).map(row => [row.workout_id, row.value, row.previous_value])).toEqual([
      [baseline, '185.00', null],
      [written, '190.00', '185.00'],
      [later, '210.00', '190.00'],
    ])
  })

  it('rebuilds a changed set source without touching workout scores and preserves velocity-only amendments', async () => {
    await actor(owner)
    const setId = randomUUID()
    const log = (value: number) => workout('2026-11-23', {
      movement_name: 'Jerk',
      performed: { set_details: [{
        id: setId, reps: 1, load: { value: 175, unit: 'lb' }, velocity: { value, unit: 'm/s' },
      }] },
    })
    const path = 'blocks[0].segments[0].events[0].performed.set_details[0]'
    const estimated = { ...verified, fields: {
      ...verified.fields, [path + '.load.value']: { ...quantities, origin: 'model_estimated' },
    } }
    const confirmed = { ...verified, fields: {
      ...verified.fields, [path + '.load.value']: { ...quantities, reviewState: 'corrected' },
    } }
    const written = await save(log(0.45), estimated)
    const savedRepMaxes = async () => (await db.query(
      "SELECT id, pr_type, value FROM public.personal_records WHERE workout_id=$1 AND pr_type='1rm'", [written],
    )).rows
    const savedScores = async () => (await db.query(
      'SELECT id FROM public.block_scores WHERE workout_id=$1', [written],
    )).rows
    const scoreIds = await savedScores()
    expect(scoreIds).toHaveLength(1)
    expect(await savedRepMaxes()).toEqual([])

    expect((await amend(written, 1, log(0.45), confirmed)).projectionsStatus).toBe('recomputed_supported_only')
    const rows = await savedRepMaxes()
    expect(rows).toEqual([expect.objectContaining({ pr_type: '1rm', value: '175.00' })])
    expect(await savedScores()).toEqual(scoreIds)

    const measured = { ...confirmed, fields: { ...confirmed.fields, [path + '.velocity.value']: quantities } }
    expect((await amend(written, 2, log(0.5), measured)).projectionsStatus).toBe('preserved_unchanged_inputs')
    expect(await savedRepMaxes()).toEqual(rows)
    expect(await savedScores()).toEqual(scoreIds)

    expect((await amend(written, 3, log(0.5), estimated)).projectionsStatus).toBe('recomputed_supported_only')
    expect(await savedRepMaxes()).toEqual([])
    expect(await savedScores()).toEqual(scoreIds)
  })

  it('keeps named workout benchmarks on their existing correction path', async () => {
    await actor(owner)
    const benchmark = (time_s: number) => {
      const record = workout('2026-11-24')
      const block = { ...record.blocks[0], block_type: 'FOR_TIME', title: 'Fran', rx_status: 'RX', block_score: { time_s } }
      return { ...record, blocks: [block] }
    }
    const written = await save(benchmark(200))
    const originalRecords = await records()
    await db.exec('RESET ROLE')
    await db.query(`
      INSERT INTO public.benchmark_prs (user_id, benchmark_name, date, score_value, score_display, rx_status, workout_id)
      VALUES ($1, 'Fran', '2026-11-24', 200, '200', 'rx', $2)
    `, [owner, written])

    await actor(owner)
    await amend(written, 1, benchmark(165))
    expect(await records()).toEqual(originalRecords)

    await db.exec('RESET ROLE')
    const result = await db.query(
      'SELECT score_value::int AS seconds FROM public.benchmark_prs WHERE user_id=$1 AND workout_id=$2', [owner, written],
    )
    expect(result.rows).toEqual([{ seconds: 165 }])
  })
})
