export interface PRResult {
  isPR: boolean;
  prType: 'weight' | 'reps' | 'time' | 'volume';
  previousBest: number;
  newRecord: number;
  exercise: string;
  improvement: string;
}

export interface WorkoutBlock {
  block_type: string;
  title?: string;
  segments?: Array<{
    rounds?: number;
    events?: Array<{
      movement_name: string;
      prescribed?: { reps?: number; distance?: { value: number; unit: string } };
      performed?: {
        reps?: number;
        load?: { value: number; unit: string };
        distance?: { value: number; unit: string };
      };
    }>;
  }>;
  block_score?: {
    rounds_completed?: number;
    extra_reps?: number;
    time_s?: number;
    total_reps?: number;
    tonnage_lb?: number;
    rx_status?: string;
    is_pr?: boolean;
  };
  score_model?: {
    scoring?: string;
    round_rep_bundle?: number;
  };
}

interface HistoricalRecord {
  exercise: string;
  pr_type: string;
  value: number;
}

function formatImprovement(prType: string, previousBest: number, newRecord: number): string {
  if (previousBest === 0) {
    return 'First time!';
  }

  if (prType === 'time') {
    // For time, lower is better
    const diff = previousBest - newRecord;
    const pct = ((diff / previousBest) * 100).toFixed(1);
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    if (mins > 0) {
      return `-${mins}:${secs.toString().padStart(2, '0')} (${pct}% faster)`;
    }
    return `-${diff}s (${pct}% faster)`;
  }

  const diff = newRecord - previousBest;
  const pct = ((diff / previousBest) * 100).toFixed(1);

  if (prType === 'weight') {
    return `+${diff} lbs (+${pct}%)`;
  }
  if (prType === 'reps') {
    return `+${diff} reps (+${pct}%)`;
  }
  // volume
  return `+${diff} lbs total (+${pct}%)`;
}

export function detectPRsFromBlocks(
  blocks: WorkoutBlock[],
  historicalRecords: HistoricalRecord[]
): PRResult[] {
  const prs: PRResult[] = [];

  // Build lookup map: exercise+prType -> best value
  const bestMap = new Map<string, number>();
  for (const rec of historicalRecords) {
    const key = `${rec.exercise.toLowerCase()}:${rec.pr_type}`;
    const existing = bestMap.get(key);
    if (existing === undefined || rec.value > existing) {
      bestMap.set(key, rec.value);
    }
  }

  // Override for time-based PRs: lower is better
  const timeBestMap = new Map<string, number>();
  for (const rec of historicalRecords) {
    if (rec.pr_type === 'time') {
      const key = `${rec.exercise.toLowerCase()}:time`;
      const existing = timeBestMap.get(key);
      if (existing === undefined || rec.value < existing) {
        timeBestMap.set(key, rec.value);
      }
    }
  }

  for (const block of blocks) {
    // --- Max weight per exercise ---
    if (block.segments) {
      for (const segment of block.segments) {
        if (!segment.events) continue;
        for (const event of segment.events) {
          const name = event.movement_name;
          const load = event.performed?.load?.value;
          if (load && load > 0) {
            const key = `${name.toLowerCase()}:weight`;
            const prev = bestMap.get(key) ?? 0;
            if (load > prev) {
              prs.push({
                isPR: true,
                prType: 'weight',
                previousBest: prev,
                newRecord: load,
                exercise: name,
                improvement: formatImprovement('weight', prev, load),
              });
            }

            // --- Max reps at this weight ---
            const reps = event.performed?.reps;
            if (reps && reps > 0) {
              const repsExercise = `${name} @ ${load} lbs`;
              const repsKey = `${repsExercise.toLowerCase()}:reps`;
              const prevReps = bestMap.get(repsKey) ?? 0;
              if (reps > prevReps) {
                prs.push({
                  isPR: true,
                  prType: 'reps',
                  previousBest: prevReps,
                  newRecord: reps,
                  exercise: repsExercise,
                  improvement: formatImprovement('reps', prevReps, reps),
                });
              }
            }
          }
        }
      }
    }

    // --- Fastest time for named WODs ---
    if (block.block_score?.time_s && block.title) {
      const wodName = block.title;
      const timeS = block.block_score.time_s;
      const key = `${wodName.toLowerCase()}:time`;
      const prevTime = timeBestMap.get(key);

      if (prevTime === undefined) {
        // First time doing this WOD
        prs.push({
          isPR: true,
          prType: 'time',
          previousBest: 0,
          newRecord: timeS,
          exercise: wodName,
          improvement: formatImprovement('time', 0, timeS),
        });
      } else if (timeS < prevTime) {
        // Faster than previous best (ties are NOT a PR)
        prs.push({
          isPR: true,
          prType: 'time',
          previousBest: prevTime,
          newRecord: timeS,
          exercise: wodName,
          improvement: formatImprovement('time', prevTime, timeS),
        });
      }
    }

    // --- Highest volume per exercise (sets x reps x weight) ---
    if (block.segments) {
      // Accumulate volume per exercise across all segments
      const volumeByExercise = new Map<string, { name: string; volume: number }>();
      for (const segment of block.segments) {
        if (!segment.events) continue;
        const rounds = segment.rounds ?? 1;
        for (const event of segment.events) {
          const name = event.movement_name;
          const reps = event.performed?.reps ?? 0;
          const load = event.performed?.load?.value ?? 0;
          if (reps > 0 && load > 0) {
            const vol = rounds * reps * load;
            const existing = volumeByExercise.get(name.toLowerCase());
            if (existing) {
              existing.volume += vol;
            } else {
              volumeByExercise.set(name.toLowerCase(), { name, volume: vol });
            }
          }
        }
      }

      for (const [, { name, volume }] of volumeByExercise) {
        const key = `${name.toLowerCase()}:volume`;
        const prevVol = bestMap.get(key) ?? 0;
        if (volume > prevVol) {
          prs.push({
            isPR: true,
            prType: 'volume',
            previousBest: prevVol,
            newRecord: volume,
            exercise: name,
            improvement: formatImprovement('volume', prevVol, volume),
          });
        }
      }
    }
  }

  return prs;
}

export function formatPRValue(prType: string, value: number): string {
  if (prType === 'time') {
    const mins = Math.floor(value / 60);
    const secs = Math.round(value % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  if (prType === 'weight') return `${value} lbs`;
  if (prType === 'reps') return `${value} reps`;
  if (prType === 'volume') return `${value} lbs`;
  return `${value}`;
}
