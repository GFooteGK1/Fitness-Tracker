import type { SupabaseClient } from '@supabase/supabase-js'
import { computeDashboardWorkoutAggregates, type DashboardWorkoutAggregateOptions, type DashboardWorkoutRow } from './aggregates/dashboard'

const WORKOUT_PAGE_SIZE = 500

/** Use the same owner-scoped workout inputs for web and plugin progress. */
export async function readOwnedWorkoutSummary(db: SupabaseClient, owner: string, options: DashboardWorkoutAggregateOptions) {
  const workouts: DashboardWorkoutRow[] = []
  let lastId: string | undefined
  while (true) {
    let query = db.from('workouts')
      .select('id, user_id, workout_date, blocks, input_text')
      .eq('user_id', owner)
    if (lastId) query = query.gt('id', lastId)

    const { data, error } = await query.order('id', { ascending: true }).limit(WORKOUT_PAGE_SIZE)
    if (error || !data) throw new Error(`Failed to fetch workouts: ${error?.message ?? 'missing rows'}`)
    if (data.some(workout => workout.user_id !== owner)) throw new Error('Workout summary is unavailable')
    workouts.push(...data)
    if (data.length < WORKOUT_PAGE_SIZE) break
    lastId = data[data.length - 1].id
  }

  return computeDashboardWorkoutAggregates(workouts, options)
}
