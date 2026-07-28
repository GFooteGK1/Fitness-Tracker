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

  type Candidate = { exercise: string; value: number };
  const weightCandidates = new Map<string, Candidate>();
  const repsCandidates = new Map<string, Candidate>();
  const timeCandidates = new Map<string, Candidate>();
  const volumeCandidates = new Map<string, Candidate>();

  // First collapse the parsed workout to one best candidate for each record.
  // Parsed sets commonly repeat the same movement event; comparing every event
  // independently creates duplicate rows and intermediate "records".
  for (const block of blocks) {
    for (const segment of block.segments ?? []) {
      const rounds = segment.rounds ?? 1;
      for (const event of segment.events ?? []) {
        const name = event.movement_name;
        const normalizedName = name.toLowerCase();
        const load = event.performed?.load?.value ?? 0;
        const reps = event.performed?.reps ?? 0;

        if (load > 0) {
          const currentWeight = weightCandidates.get(normalizedName);
          if (!currentWeight || load > currentWeight.value) {
            weightCandidates.set(normalizedName, { exercise: name, value: load });
          }

          if (reps > 0) {
            const repsExercise = `${name} @ ${load} lbs`;
            const repsKey = repsExercise.toLowerCase();
            const currentReps = repsCandidates.get(repsKey);
            if (!currentReps || reps > currentReps.value) {
              repsCandidates.set(repsKey, { exercise: repsExercise, value: reps });
            }

            const volume = rounds * reps * load;
            const currentVolume = volumeCandidates.get(normalizedName);
            if (currentVolume) {
              currentVolume.value += volume;
            } else {
              volumeCandidates.set(normalizedName, { exercise: name, value: volume });
            }
          }
        }
      }
    }

    const timeS = block.block_score?.time_s ?? 0;
    if (timeS > 0 && block.title) {
      const key = block.title.toLowerCase();
      const currentTime = timeCandidates.get(key);
      if (!currentTime || timeS < currentTime.value) {
        timeCandidates.set(key, { exercise: block.title, value: timeS });
      }
    }
  }

  for (const [exerciseKey, candidate] of weightCandidates) {
    const previousBest = bestMap.get(`${exerciseKey}:weight`) ?? 0;
    if (candidate.value > previousBest) {
      prs.push({
        isPR: true,
        prType: 'weight',
        previousBest,
        newRecord: candidate.value,
        exercise: candidate.exercise,
        improvement: formatImprovement('weight', previousBest, candidate.value),
      });
    }
  }

  for (const [exerciseKey, candidate] of repsCandidates) {
    const previousBest = bestMap.get(`${exerciseKey}:reps`) ?? 0;
    if (candidate.value > previousBest) {
      prs.push({
        isPR: true,
        prType: 'reps',
        previousBest,
        newRecord: candidate.value,
        exercise: candidate.exercise,
        improvement: formatImprovement('reps', previousBest, candidate.value),
      });
    }
  }

  for (const [exerciseKey, candidate] of timeCandidates) {
    const previousBest = timeBestMap.get(`${exerciseKey}:time`) ?? 0;
    if (previousBest === 0 || candidate.value < previousBest) {
      prs.push({
        isPR: true,
        prType: 'time',
        previousBest,
        newRecord: candidate.value,
        exercise: candidate.exercise,
        improvement: formatImprovement('time', previousBest, candidate.value),
      });
    }
  }

  for (const [exerciseKey, candidate] of volumeCandidates) {
    const previousBest = bestMap.get(`${exerciseKey}:volume`) ?? 0;
    if (candidate.value > previousBest) {
      prs.push({
        isPR: true,
        prType: 'volume',
        previousBest,
        newRecord: candidate.value,
        exercise: candidate.exercise,
        improvement: formatImprovement('volume', previousBest, candidate.value),
      });
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
