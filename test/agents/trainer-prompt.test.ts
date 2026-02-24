import { describe, it, expect } from 'vitest'
import { buildTrainerPrompt } from '@/app/lib/agents/prompts/trainer'
import { MOVEMENT_ALIASES } from '@/app/lib/agents/constants'
import type { TrainerContext, RecentWorkout, BenchmarkPR, ChatMessage, RecentInsight } from '@/app/lib/agents/types'

// ─── Test Helpers ────────────────────────────────────────────────────

function makeBaseContext(overrides?: Partial<TrainerContext>): TrainerContext {
  return {
    user_id: 'test-user-123',
    targets: { protein: 150, carbs: 200, fat: 65, calories: 2000, tolerance_pct: 10 },
    today: {
      meals_logged: 2,
      macros_consumed: { protein: 80, carbs: 100, fat: 30, calories: 1000 },
      macros_remaining: { protein: 70, carbs: 100, fat: 35, calories: 1000 },
      workouts_logged: 0,
      latest_whoop_recovery: null,
      latest_whoop_strain: null,
    },
    week: {
      days_elapsed: 3,
      actual: { protein: 400, carbs: 500, fat: 180, calories: 5200 },
      prorated_target: { protein: 450, carbs: 600, fat: 195, calories: 6000 },
      adherence_pct: { protein: 89, carbs: 83, fat: 92, calories: 87 },
      overall_status: 'on-track',
    },
    recent_chat: [],
    pending_insights: [],
    current_time: '2026-01-20T14:30:00Z',
    day_of_week: 'Tuesday',
    has_whoop: false,
    recent_workouts: [],
    benchmark_prs: [],
    todays_program: null,
    movement_aliases: MOVEMENT_ALIASES,
    ...overrides,
  }
}

function makeWorkout(overrides?: Partial<RecentWorkout>): RecentWorkout {
  return {
    id: 'w1',
    date: '2026-01-19',
    input_text: '5 rounds: 10 DL 225#, 15 BJ',
    blocks: [{
      block_type: 'FOR_TIME',
      movements: [
        { name: 'Deadlift', reps: 10, weight: '225 lb' },
        { name: 'Box Jump', reps: 15 },
      ],
      score: { time_s: 847 },
      rx_status: 'RX',
    }],
    primary_score: '14:07',
    rpe: 8,
    tags: ['metcon'],
    ...overrides,
  }
}

function makePR(overrides?: Partial<BenchmarkPR>): BenchmarkPR {
  return {
    benchmark_name: 'Fran',
    score_value: 272,
    score_display: '4:32',
    date: '2026-01-15',
    rx_status: 'RX',
    ...overrides,
  }
}

// ─── Core Function Tests ─────────────────────────────────────────────

describe('buildTrainerPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildTrainerPrompt(makeBaseContext())
    expect(prompt).toBeTruthy()
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(100)
  })

  it('includes the Trainer persona', () => {
    const prompt = buildTrainerPrompt(makeBaseContext())
    expect(prompt).toContain('SociusFit Trainer')
    expect(prompt).toContain('expert CrossFit')
    expect(prompt).toContain('Direct, encouraging, data-driven')
  })

  it('includes current state from context', () => {
    const prompt = buildTrainerPrompt(makeBaseContext())
    expect(prompt).toContain('Tuesday')
    expect(prompt).toContain('2026-01-20T14:30:00Z')
    expect(prompt).toContain('Workouts logged today: 0')
  })

  it('embeds WHOOP data when available', () => {
    const ctx = makeBaseContext({
      has_whoop: true,
      today: {
        meals_logged: 0,
        macros_consumed: { protein: 0, carbs: 0, fat: 0, calories: 0 },
        macros_remaining: { protein: 150, carbs: 200, fat: 65, calories: 2000 },
        workouts_logged: 1,
        latest_whoop_recovery: 82,
        latest_whoop_strain: 14.5,
      },
    })
    const prompt = buildTrainerPrompt(ctx)
    expect(prompt).toContain('82%')
    expect(prompt).toContain('14.5')
    expect(prompt).toContain('Has WHOOP: Yes')
  })

  it('shows N/A when WHOOP data is absent', () => {
    const prompt = buildTrainerPrompt(makeBaseContext())
    expect(prompt).toContain('WHOOP Recovery: N/A')
    expect(prompt).toContain('WHOOP Strain: N/A')
    expect(prompt).toContain('Has WHOOP: No')
  })
})

// ─── Recent Workouts Embedding ───────────────────────────────────────

describe('buildTrainerPrompt - recent workouts', () => {
  it('shows "No recent workouts" when empty', () => {
    const prompt = buildTrainerPrompt(makeBaseContext({ recent_workouts: [] }))
    expect(prompt).toContain('No recent workouts')
  })

  it('embeds workout details from context', () => {
    const workout = makeWorkout()
    const prompt = buildTrainerPrompt(makeBaseContext({ recent_workouts: [workout] }))
    expect(prompt).toContain('2026-01-19')
    expect(prompt).toContain('5 rounds: 10 DL 225#, 15 BJ')
    expect(prompt).toContain('Deadlift')
    expect(prompt).toContain('14:07')
    expect(prompt).toContain('RPE: 8')
  })

  it('embeds multiple workouts', () => {
    const w1 = makeWorkout({ id: 'w1', date: '2026-01-18', input_text: 'Back Squat 5x5 @ 275' })
    const w2 = makeWorkout({ id: 'w2', date: '2026-01-19', input_text: 'Fran 4:32 Rx' })
    const prompt = buildTrainerPrompt(makeBaseContext({ recent_workouts: [w1, w2] }))
    expect(prompt).toContain('2026-01-18')
    expect(prompt).toContain('2026-01-19')
    expect(prompt).toContain('Back Squat 5x5 @ 275')
    expect(prompt).toContain('Fran 4:32 Rx')
  })

  it('handles workouts with null RPE', () => {
    const workout = makeWorkout({ rpe: null })
    const prompt = buildTrainerPrompt(makeBaseContext({ recent_workouts: [workout] }))
    expect(prompt).toContain('RPE: N/A')
  })

  it('handles workouts with no tags', () => {
    const workout = makeWorkout({ tags: [] })
    const prompt = buildTrainerPrompt(makeBaseContext({ recent_workouts: [workout] }))
    expect(prompt).toContain('Tags: none')
  })
})

// ─── Benchmark PRs Embedding ─────────────────────────────────────────

describe('buildTrainerPrompt - benchmark PRs', () => {
  it('shows "No PRs recorded yet" when empty', () => {
    const prompt = buildTrainerPrompt(makeBaseContext({ benchmark_prs: [] }))
    expect(prompt).toContain('No PRs recorded yet')
  })

  it('embeds PR details', () => {
    const pr = makePR()
    const prompt = buildTrainerPrompt(makeBaseContext({ benchmark_prs: [pr] }))
    expect(prompt).toContain('Fran')
    expect(prompt).toContain('4:32')
    expect(prompt).toContain('RX')
    expect(prompt).toContain('2026-01-15')
  })

  it('embeds multiple PRs', () => {
    const prs = [
      makePR({ benchmark_name: 'Fran', score_display: '4:32' }),
      makePR({ benchmark_name: 'Grace', score_display: '2:15', date: '2026-01-10' }),
    ]
    const prompt = buildTrainerPrompt(makeBaseContext({ benchmark_prs: prs }))
    expect(prompt).toContain('Fran')
    expect(prompt).toContain('Grace')
    expect(prompt).toContain('2:15')
  })
})

// ─── Today's Program Embedding ───────────────────────────────────────

describe('buildTrainerPrompt - todays program', () => {
  it('shows "No program loaded" when null', () => {
    const prompt = buildTrainerPrompt(makeBaseContext({ todays_program: null }))
    expect(prompt).toContain('No program loaded for today')
  })

  it('embeds program text when present', () => {
    const program = 'A) Back Squat 5x5 @ 80%\nB) 12min AMRAP: 10 T2B, 15 WB'
    const prompt = buildTrainerPrompt(makeBaseContext({ todays_program: program }))
    expect(prompt).toContain('Back Squat 5x5 @ 80%')
    expect(prompt).toContain('12min AMRAP')
  })
})

// ─── Movement Aliases Embedding ──────────────────────────────────────

describe('buildTrainerPrompt - movement aliases', () => {
  it('embeds movement aliases from context', () => {
    const prompt = buildTrainerPrompt(makeBaseContext())
    expect(prompt).toContain('DL→Deadlift')
    expect(prompt).toContain('BS→Back Squat')
    expect(prompt).toContain('PU→Pull-up')
    expect(prompt).toContain('HSPU→Handstand Push-up')
    expect(prompt).toContain('MU→Muscle-up')
  })

  it('works with custom aliases', () => {
    const ctx = makeBaseContext({
      movement_aliases: { 'SQ': 'Squat', 'BP': 'Bench Press' },
    })
    const prompt = buildTrainerPrompt(ctx)
    expect(prompt).toContain('SQ→Squat')
    expect(prompt).toContain('BP→Bench Press')
    // The Movement Aliases section should only contain the custom aliases
    const aliasSection = prompt.split('## Movement Aliases')[1].split('##')[0]
    expect(aliasSection).not.toContain('BS→Back Squat')
  })
})

// ─── Instruction Sections ────────────────────────────────────────────

describe('buildTrainerPrompt - instructions', () => {
  it('includes block type parsing instructions', () => {
    const prompt = buildTrainerPrompt(makeBaseContext())
    expect(prompt).toContain('AMRAP')
    expect(prompt).toContain('FOR_TIME')
    expect(prompt).toContain('EMOM')
    expect(prompt).toContain('STRENGTH')
    expect(prompt).toContain('CARDIO')
  })

  it('includes PR detection instructions', () => {
    const prompt = buildTrainerPrompt(makeBaseContext())
    expect(prompt).toContain('PR Detection')
    expect(prompt).toContain('new PR')
    expect(prompt).toContain('benchmark')
  })

  it('includes smart default rules', () => {
    const prompt = buildTrainerPrompt(makeBaseContext())
    expect(prompt).toContain('Smart Default')
    expect(prompt).toContain('Missing RPE')
    expect(prompt).toContain('Missing weight')
    expect(prompt).toContain('assumed from last session')
  })

  it('includes known benchmarks', () => {
    const prompt = buildTrainerPrompt(makeBaseContext())
    expect(prompt).toContain('Fran')
    expect(prompt).toContain('Murph')
    expect(prompt).toContain('Grace')
    expect(prompt).toContain('Fight Gone Bad')
  })

  it('includes JSON response format', () => {
    const prompt = buildTrainerPrompt(makeBaseContext())
    expect(prompt).toContain('"message"')
    expect(prompt).toContain('"workout"')
    expect(prompt).toContain('"new_prs"')
    expect(prompt).toContain('"smart_defaults"')
    expect(prompt).toContain('"confidence"')
    expect(prompt).toContain('"block_type"')
    expect(prompt).toContain('"movements"')
  })

  it('includes weight and time notation guides', () => {
    const prompt = buildTrainerPrompt(makeBaseContext())
    expect(prompt).toContain('225#')
    expect(prompt).toContain('225 lb')
    expect(prompt).toContain('BW')
    expect(prompt).toContain('bodyweight')
    expect(prompt).toContain('12:34')
  })

  it('includes score notation guide', () => {
    const prompt = buildTrainerPrompt(makeBaseContext())
    expect(prompt).toContain('7+5')
    expect(prompt).toContain('7 rounds + 5 extra reps')
  })
})

// ─── Pending Insights & Recent Chat ──────────────────────────────────

describe('buildTrainerPrompt - insights and chat', () => {
  it('shows "None" when no pending insights', () => {
    const prompt = buildTrainerPrompt(makeBaseContext({ pending_insights: [] }))
    expect(prompt).toContain('Pending Insights')
    expect(prompt).toContain('None')
  })

  it('embeds pending insights when present', () => {
    const insights: RecentInsight[] = [{
      id: 'i1',
      pattern_id: 'CAL_DEF',
      priority: 'urgent',
      confidence: 0.85,
      content: 'Caloric deficit detected on high-strain day',
      created_at: '2026-01-20T10:00:00Z',
    }]
    const prompt = buildTrainerPrompt(makeBaseContext({ pending_insights: insights }))
    expect(prompt).toContain('CAL_DEF')
    expect(prompt).toContain('urgent')
    expect(prompt).toContain('Caloric deficit detected')
  })

  it('shows "No recent conversation" when chat is empty', () => {
    const prompt = buildTrainerPrompt(makeBaseContext({ recent_chat: [] }))
    expect(prompt).toContain('No recent conversation')
  })

  it('embeds recent chat messages (last 5)', () => {
    const messages: ChatMessage[] = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      user_id: 'test-user-123',
      role: i % 2 === 0 ? 'user' as const : 'trainer' as const,
      content: `Message ${i}`,
      input_mode: null,
      input_type: null,
      domain: null,
      confidence: null,
      related_entity_id: null,
      related_entity_type: null,
      is_compacted: false,
      created_at: `2026-01-20T${10 + i}:00:00Z`,
    }))
    const prompt = buildTrainerPrompt(makeBaseContext({ recent_chat: messages }))
    // Should include last 5 messages (indices 3-7)
    expect(prompt).toContain('Message 3')
    expect(prompt).toContain('Message 7')
    // Should NOT include earlier messages
    expect(prompt).not.toContain('[user]: Message 0')
    expect(prompt).not.toContain('[trainer]: Message 1')
    expect(prompt).not.toContain('[user]: Message 2')
  })
})
