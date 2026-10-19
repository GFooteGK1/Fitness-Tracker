import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { intent } from './personalized-coaching/intent'

export const contextNow = '2026-10-18T12:00:00.000Z'
export const contextOwner = 'athlete-one'
export type ContextRows = Record<string, Array<Record<string, unknown>>>

export function contextRows(): ContextRows {
  const memory = (memory_key: string, kind: string, content: unknown) => ({
    id: `memory-${memory_key}`, user_id: contextOwner, memory_key, kind, content,
    version: 1, status: 'confirmed', provenance: { source: 'athlete' }, confidence: 1,
    confirmed_at: '2026-10-17T12:00:00.000Z', effective_from: null, effective_until: null,
    review_after: null, last_reviewed_at: null,
  })
  return {
    coach_context_revisions: [{ user_id: contextOwner, revision: 3 }],
    user_profiles: [{ user_id: contextOwner, fitness_goals: ['Run comfortably'], created_at: contextNow, updated_at: contextNow }],
    coach_memories: [memory('training_intent', 'goal', intent()), memory('primary_goal', 'goal', { statement: 'Run comfortably' }),
      memory('training_schedule', 'schedule', { trainingDays: ['sunday', 'wednesday'] }),
      memory('available_equipment', 'equipment', { equipment: 'Track' }), memory('training_constraints', 'constraint', { constraints: 'None reported' }),
      memory('exercise_preferences', 'preference', { state: 'none' })],
    training_programs: [{ id: 'program-one', user_id: contextOwner, title: 'Saved program', status: 'active',
      active_plan_version_id: 'accepted-one', start_date: '2026-10-12', end_date: '2026-10-18', goal_summary: 'Run comfortably', created_at: contextNow }],
    training_plan_versions: [{ id: 'accepted-one', user_id: contextOwner, program_id: 'program-one', version: 1,
      status: 'accepted', reference_version: 'saved-reference', policy_version: 'saved-policy', intent: { rationale: 'Saved intent' },
      input_snapshot: { goal: 'Historical goal at acceptance' }, created_at: contextNow, accepted_at: contextNow }],
    prescribed_sessions: [{ id: 'session-one', user_id: contextOwner, program_id: 'program-one', plan_version_id: 'accepted-one',
      week_number: 1, session_index: 1, scheduled_date: '2026-10-18', status: 'planned', completed_workout_id: null,
      prescription: { format: 'legacy', title: 'Saved easy session', exactSavedLoad: 17.5 } }],
    adaptation_proposals: [], workouts: [], coach_checkins: [],
    whoop_tokens: [{ id: 'token-id-only', user_id: contextOwner }],
    whoop_sync_status: [{ user_id: contextOwner, status: 'idle', last_sync_at: '2026-10-18T11:00:00.000Z', error_message: null }],
    whoop_recovery: [{ id: 'recovery-one', user_id: contextOwner, cycle_id: 12, date: '2026-10-18', recovery_score: 71, created_at: contextNow }],
    whoop_sleep: [{ id: 'sleep-one', user_id: contextOwner, sleep_id: 'vendor-sleep', date: '2026-10-18', is_nap: false, sleep_performance_percentage: 82, created_at: contextNow }],
    whoop_cycles: [{ id: 'cycle-one', user_id: contextOwner, cycle_id: 12, date: '2026-10-18', strain: 3, created_at: contextNow }],
  }
}

/** Executable query oracle: real filters/caps/projections; mutation methods fail. */
export function contextClient(rows = contextRows(), options: {
  authenticated?: boolean; foreignRows?: boolean; failTable?: string; unknownCountTable?: string;
  onRead?: (table: string, read: number) => void;
} = {}) {
  const writes = vi.fn(() => { throw new Error('Forbidden write') })
  const traces: Array<{ table: string; filters: Array<[string, unknown]>; columns: string; limit: number }> = []
  const reads: Record<string, number> = {}
  const db = {
    auth: { getUser: vi.fn(async () => ({ data: { user: options.authenticated === false ? null : { id: contextOwner } }, error: null })) },
    rpc: writes,
    from: vi.fn((table: string) => {
      const trace = { table, filters: [] as Array<[string, unknown]>, columns: '', limit: Infinity }; traces.push(trace)
      const filters: Array<(row: Record<string, unknown>) => boolean> = []
      const orders: Array<{ key: string; ascending: boolean }> = []
      const q = {
        select: (columns: string) => { trace.columns = columns; return q },
        eq: (key: string, value: unknown) => { trace.filters.push([key, value]); filters.push(row => options.foreignRows && key === 'user_id' || row[key] === value); return q },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return q },
        gte: (key: string, value: string) => { filters.push(row => String(row[key]) >= value); return q },
        lte: (key: string, value: string) => { filters.push(row => String(row[key]) <= value); return q },
        order: (key: string, settings: { ascending: boolean }) => { orders.push({ key, ...settings }); return q },
        limit: (limit: number) => { trace.limit = limit; return q },
        insert: writes, update: writes, upsert: writes, delete: writes,
        then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve().then(() => {
          reads[table] = (reads[table] ?? 0) + 1; options.onRead?.(table, reads[table])
          let selected = structuredClone(rows[table] ?? []).filter(row => filters.every(filter => filter(row)))
          for (const { key, ascending } of [...orders].reverse()) selected.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1))
          const count = selected.length
          selected = selected.slice(0, trace.limit)
          if (trace.columns !== '*') {
            const columns = trace.columns.split(',').map(column => column.trim())
            selected = selected.map(row => Object.fromEntries(columns.filter(key => key in row).map(key => [key, row[key]])))
          }
          return { data: options.failTable === table ? null : selected, error: options.failTable === table ? { message: 'private provider detail' } : null,
            count: options.unknownCountTable === table ? null : count }
        }).then(resolve, reject),
      }
      return q
    }),
  }
  return { db: db as unknown as SupabaseClient, traces, writes }
}
