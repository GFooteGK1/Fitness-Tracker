import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchCoachRuntimeContext } from '@/app/lib/coach/athlete-context'
import { getEightWeekIntent } from '@/app/lib/coach/policy'

interface MockResult {
  data: unknown[] | null
  error: { message: string } | null
}

function createCoachSupabaseMock(results: Record<string, MockResult>) {
  const queries = new Map<string, Record<string, ReturnType<typeof vi.fn>>>()

  const supabase = {
    from: vi.fn((table: string) => {
      const query: Record<string, ReturnType<typeof vi.fn>> = {
        select: vi.fn(),
        eq: vi.fn(),
        lte: vi.fn(),
        order: vi.fn(),
        limit: vi.fn()
      }

      query.select.mockReturnValue(query)
      query.eq.mockReturnValue(query)
      query.lte.mockReturnValue(query)
      query.order.mockReturnValue(query)
      query.limit.mockResolvedValue(results[table] ?? { data: [], error: null })
      queries.set(table, query)
      return query
    })
  } as unknown as SupabaseClient

  return { supabase, queries }
}

describe('fetchCoachRuntimeContext', () => {
  it('normalizes confirmed athlete state and the active eight-week plan', async () => {
    const { supabase } = createCoachSupabaseMock({
      coach_strength_assessments: {
        data: [{
          id: 'assessment-1',
          movement: 'Back Squat',
          variation: 'high bar',
          load: '100.00',
          unit: 'kg',
          reps: 5,
          assessed_on: '2026-07-25',
          is_true_rep_max: true,
          rir: '0',
          rpe: '10',
          athlete_confidence: '0.85',
          estimated_1rm: '116.70',
          estimate_kind: 'estimated_1rm',
          calculator_version: 'epley-general-v1'
        }],
        error: null
      },
      coach_memories: {
        data: [{
          id: 'memory-1',
          memory_key: 'primary_goal',
          kind: 'goal',
          content: { goal: 'Build strength without losing speed' },
          provenance: { source: 'athlete' },
          confidence: '1',
          confirmed_at: '2026-07-26T12:00:00Z',
          version: 1,
          effective_from: null,
          effective_until: null,
          review_after: null,
          last_reviewed_at: null
        }, {
          id: 'memory-expired',
          memory_key: 'temporary_constraint',
          kind: 'constraint',
          content: { note: 'No overhead work' },
          provenance: { source: 'athlete' },
          confidence: '1',
          confirmed_at: '2026-07-26T12:00:00Z',
          version: 1,
          effective_from: null,
          effective_until: '2026-08-01T00:00:00Z',
          review_after: null,
          last_reviewed_at: null
        }],
        error: null
      },
      training_programs: {
        data: [{
          id: 'program-1',
          title: 'Summer block',
          goal_summary: 'Strength and speed',
          start_date: '2026-07-27',
          end_date: '2026-09-20',
          active_plan_version_id: 'plan-1'
        }],
        error: null
      },
      training_plan_versions: {
        data: [{
          id: 'plan-1',
          version: 2,
          reference_version: '0.1.0',
          policy_version: '0.1.0',
          intent: {
            horizon_weeks: 8,
            adaptive_programming: {
              scheduledAssessments: [{
                id: 'assessment:strength:week-4',
                goalId: 'goal:strength',
                hypothesisId: 'hypothesis:strength',
                weekNumber: 4,
                scheduledOn: '2026-08-17',
                assessmentDefinition: {
                  id: 'strength.repetition_max',
                  version: '1.0.0',
                  catalogVersion: '0.2.0'
                },
                protocol: { id: 'strength-repetition-max-standard', version: '1.0.0' },
                metricId: 'strength.load',
                semanticRole: 'direct_outcome'
              }]
            },
            weeks: getEightWeekIntent().map(week => week.week === 3
              ? { ...week, role: 'build' as const }
              : week)
          }
        }],
        error: null
      },
      prescribed_sessions: {
        data: [{
          id: 'session-1',
          week_number: 3,
          session_index: 1,
          scheduled_date: '2026-08-10',
          prescription: {
            domain: 'strength',
            intent: 'Produce repeatable force',
            dose: { source: 'validated_policy' }
          },
          status: 'completed',
          completion_contract_version: 2,
          completed_workout_id: 'workout-1'
        }, {
          id: 'session-2',
          week_number: 4,
          session_index: 1,
          scheduled_date: '2026-08-17',
          prescription: {
            domain: 'strength',
            intent: 'Reassess repeatable strength'
          },
          status: 'planned',
          completion_contract_version: null,
          completed_workout_id: null
        }],
        error: null
      },
      coach_checkins: {
        data: [{
          id: 'checkin-1',
          prescribed_session_id: 'session-1',
          responses: {
            schemaVersion: 1,
            outcome: 'as_planned',
            sessionRpe: 7,
            energy: 'okay',
            pain: 'none',
            note: null
          },
          occurred_at: '2026-08-10T18:00:00+00:00'
        }],
        error: null
      }
    })

    const context = await fetchCoachRuntimeContext(
      supabase,
      'user-123',
      new Date('2026-08-10T12:00:00Z')
    )

    expect(context.storageAvailable).toBe(true)
    expect(context.assessments[0]).toMatchObject({
      movement: 'Back Squat',
      load: 100,
      estimatedOneRepMax: 116.7,
      estimateKind: 'estimated_1rm'
    })
    expect(context.memories[0]).toMatchObject({
      memoryKey: 'primary_goal',
      content: { goal: 'Build strength without losing speed' },
      provenance: { source: 'athlete' }
    })
    expect(context.memories).toHaveLength(1)
    expect(context.activeProgram).toMatchObject({
      id: 'program-1',
      planVersion: 2,
      currentWeek: 3,
      currentWeekRole: 'build',
      weeks: expect.arrayContaining([
        expect.objectContaining({ week: 4, role: 'deload_review', reviewRequired: true })
      ]),
      upcomingSessions: expect.arrayContaining([expect.objectContaining({
          id: 'session-1',
          weekNumber: 3,
          completionContractVersion: 2,
          completedWorkoutId: 'workout-1',
          scheduledMeasurements: []
        }), expect.objectContaining({
          id: 'session-2',
          weekNumber: 4,
          scheduledMeasurements: [expect.objectContaining({
            id: 'assessment:strength:week-4',
            metricId: 'strength.load'
          })]
        })]),
      sessionCheckins: [{
        id: 'checkin-1',
        prescribedSessionId: 'session-1',
        outcome: 'as_planned',
        sessionRpe: 7,
        occurredAt: '2026-08-10T18:00:00.000Z'
      }],
      currentWeekReview: {
        weekNumber: 3,
        status: 'ready',
        completedSessions: 1,
        adaptationProposal: {
          action: 'continue_as_written'
        }
      }
    })
  })

  it('fails closed to empty context when coach storage is unavailable', async () => {
    const missing = { data: null, error: { message: 'relation does not exist' } }
    const { supabase } = createCoachSupabaseMock({
      coach_strength_assessments: missing,
      coach_memories: missing,
      training_programs: missing
    })

    const context = await fetchCoachRuntimeContext(supabase, 'user-123')

    expect(context.storageAvailable).toBe(false)
    expect(context.assessments).toEqual([])
    expect(context.memories).toEqual([])
    expect(context.activeProgram).toBeNull()
  })
})
