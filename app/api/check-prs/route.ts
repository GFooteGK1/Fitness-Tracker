import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'
import { detectPRsFromBlocks, type WorkoutBlock } from '@/app/lib/pr-detection'

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const { workoutId, blocks } = await request.json() as {
      workoutId: string;
      blocks: WorkoutBlock[];
    }

    if (!workoutId || !blocks || !Array.isArray(blocks)) {
      return apiError('workoutId and blocks are required', 400)
    }

    // Gather all exercise names and WOD titles from this workout
    const exerciseNames = new Set<string>()
    for (const block of blocks) {
      if (block.title) exerciseNames.add(block.title.toLowerCase())
      if (block.segments) {
        for (const seg of block.segments) {
          if (!seg.events) continue
          for (const event of seg.events) {
            exerciseNames.add(event.movement_name.toLowerCase())
            // Also add reps-at-weight keys
            const load = event.performed?.load?.value
            if (load && load > 0) {
              exerciseNames.add(`${event.movement_name.toLowerCase()}@${load}lb`)
            }
          }
        }
      }
    }

    // Fetch user's historical PRs for these exercises
    const { data: historicalPRs, error: prError } = await supabase
      .from('personal_records')
      .select('exercise, pr_type, value')
      .eq('user_id', user.id)

    if (prError) {
      console.error('Error fetching historical PRs:', prError)
      return apiError('Failed to fetch PR history', 500)
    }

    // Also check block_scores for historical data (for users without PR records yet)
    const { data: historicalBlocks, error: blockError } = await supabase
      .from('workouts')
      .select('blocks')
      .eq('user_id', user.id)
      .neq('id', workoutId)
      .order('workout_date', { ascending: false })
      .limit(200)

    if (blockError) {
      console.error('Error fetching historical workouts:', blockError)
    }

    // Build historical records from both sources
    const historicalRecords: Array<{ exercise: string; pr_type: string; value: number }> = []

    // From personal_records table
    if (historicalPRs) {
      for (const pr of historicalPRs) {
        historicalRecords.push({
          exercise: pr.exercise,
          pr_type: pr.pr_type,
          value: Number(pr.value),
        })
      }
    }

    // From historical workout blocks (to catch data from before PR tracking)
    if (historicalBlocks) {
      for (const workout of historicalBlocks) {
        const wBlocks = workout.blocks as WorkoutBlock[]
        if (!wBlocks) continue
        const volumeByExercise = new Map<string, { exercise: string; value: number }>()
        for (const block of wBlocks) {
          if (block.segments) {
            for (const seg of block.segments) {
              if (!seg.events) continue
              const rounds = seg.rounds ?? 1
              for (const event of seg.events) {
                const name = event.movement_name
                const load = event.performed?.load?.value
                const reps = event.performed?.reps
                if (load && load > 0) {
                  historicalRecords.push({ exercise: name, pr_type: 'weight', value: load })
                  if (reps && reps > 0) {
                    historicalRecords.push({
                      exercise: `${name} @ ${load} lbs`,
                      pr_type: 'reps',
                      value: reps,
                    })
                    const volume = rounds * reps * load
                    const key = name.toLowerCase()
                    const current = volumeByExercise.get(key)
                    if (current) {
                      current.value += volume
                    } else {
                      volumeByExercise.set(key, { exercise: name, value: volume })
                    }
                  }
                }
              }
            }
          }
          if (block.block_score?.time_s && block.title) {
            historicalRecords.push({
              exercise: block.title,
              pr_type: 'time',
              value: block.block_score.time_s,
            })
          }
        }
        for (const volume of volumeByExercise.values()) {
          historicalRecords.push({
            exercise: volume.exercise,
            pr_type: 'volume',
            value: volume.value,
          })
        }
      }
    }

    // Detect PRs
    const prs = detectPRsFromBlocks(blocks, historicalRecords)

    // Store detected PRs
    if (prs.length > 0) {
      const prRecords = prs.map(pr => ({
        user_id: user.id,
        exercise: pr.exercise,
        pr_type: pr.prType,
        value: pr.newRecord,
        previous_value: pr.previousBest > 0 ? pr.previousBest : null,
        workout_id: workoutId,
        achieved_at: new Date().toISOString(),
      }))

      const { error: insertError } = await supabase
        .from('personal_records')
        .upsert(prRecords, {
          onConflict: 'user_id,workout_id,exercise,pr_type',
          ignoreDuplicates: true,
        })

      if (insertError) {
        console.error('Error storing PRs:', insertError)
        // Don't fail the request - PRs were detected even if storage fails
      }
    }

    return NextResponse.json({ prs })
  } catch (error) {
    console.error('PR check error:', error)
    return apiError('Failed to check PRs', 500, error instanceof Error ? error.message : 'Unknown error')
  }
}
