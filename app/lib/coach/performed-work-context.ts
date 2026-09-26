import type { SupabaseClient } from '@supabase/supabase-js'
import { formatUTCAsLocalDateWithOffset, localDateToUTCStart } from '../timezone-utils'
import { personalizedCoachingCapabilities } from '../personalized-coaching-capabilities'
import { fetchPlanningHistorySnapshot, type PlanningHistorySnapshot } from './planning-context'
import { resolveHistorySnapshot, historyFieldProvenance } from './planning-history'
import { normalizePerformedDoseEvidence } from './performed-dose-evidence'

const RECORD_BUDGET = 16_000

/** Factual projection only: retains source quantities without selecting a future dose. */
export function buildPerformedWorkContext(input: PlanningHistorySnapshot) {
  const resolved = resolveHistorySnapshot({ ...input, revisions: input.revisions ?? [] })
  const normalized = normalizePerformedDoseEvidence({
    userId: input.userId, asOf: input.asOf, startsOn: input.startsOn, endsOn: input.endsOn,
    retrievalComplete: input.available && input.complete && resolved.issues.length === 0,
    athleteCoverage: 'unknown', workouts: resolved.workouts, completions: input.completions ?? [],
  })
  let usedRecordCharacters = 0
  const omitted: Array<{ sourceId: string; sourcePath: string; reason: string }> = []
  const records = normalized.exposures.flatMap(exposure => {
    const exclude = exposure.basis === 'unverified_prescription' ? 'prescription_execution_unconfirmed'
      : ['copied_template', 'imported_unverified'].includes(exposure.origin) && exposure.reviewState === 'unreviewed'
        ? 'unreviewed_template_or_import' : null
    if (exclude) { omitted.push({ sourceId: exposure.sourceId, sourcePath: exposure.sourcePath, reason: exclude }); return [] }
    const row = resolved.workouts.find(workout => workout.id === exposure.workoutId)!
    const record = {
      sourceId: exposure.sourceId, sourcePath: exposure.sourcePath, workoutId: exposure.workoutId,
      completionId: exposure.completionId, sessionId: exposure.sessionId, date: exposure.date,
      capturedAt: exposure.capturedAt, revision: exposure.revision, snapshotId: exposure.snapshotId,
      movementId: exposure.movementId,
      recordedName: typeof exposure.raw.name === 'string' ? exposure.raw.name : null,
      role: exposure.role, basis: exposure.basis, origin: exposure.origin, reviewState: exposure.reviewState,
      completionState: exposure.raw.completed === false ? 'explicitly_not_completed' as const
        : exposure.raw.workStatus === 'unsure' ? 'uncertain' as const : 'not_independently_verified' as const,
      quantities: { sets: exposure.sets, repetitions: exposure.repetitions, load: exposure.load,
        loadUnit: exposure.loadUnit, durationMinutes: exposure.durationMinutes },
      quantityProvenance: exposure.quantityProvenance,
      // Legacy logging stores weight text. Preserve it literally rather than
      // silently parsing units, overriding load, or treating a range as exact.
      recordedWeight: exposure.raw.weight === undefined ? null : {
        value: exposure.raw.weight, sourcePath: `${exposure.sourcePath}.weight`,
        ...historyFieldProvenance(row.capture_provenance, `${exposure.sourcePath}.weight`, 'quantities'),
      },
      protocol: exposure.protocol, equipment: exposure.equipment,
      effort: exposure.effort, unilateralConvention: exposure.unilateralConvention,
      // Workout effort describes the session. It cannot establish effort for
      // this movement, a working set, or a maximum-strength attempt.
      sessionEffort: {
        scale: 'RPE' as const, scope: 'session' as const, sourcePath: 'rpe' as const,
        value: typeof row.rpe === 'number' && Number.isFinite(row.rpe) && row.rpe >= 1 && row.rpe <= 10 ? row.rpe : null,
        recordedValue: structuredClone(row.rpe ?? null),
        status: row.rpe == null ? 'unknown' as const
          : typeof row.rpe === 'number' && Number.isFinite(row.rpe) && row.rpe >= 1 && row.rpe <= 10 ? 'recorded' as const : 'invalid' as const,
        ...historyFieldProvenance(row.capture_provenance, 'rpe', 'rpe'),
      },
      limitations: exposure.limitations,
    }
    const size = JSON.stringify(record).length
    if (usedRecordCharacters + size > RECORD_BUDGET) {
      omitted.push({ sourceId: exposure.sourceId, sourcePath: exposure.sourcePath, reason: 'record_budget' }); return []
    }
    usedRecordCharacters += size
    return [structuredClone(record)]
  })
  const issues = [...resolved.issues, ...normalized.issues]
  const missing = [...(input.missing ?? []), ...(!input.available ? ['history_unavailable'] : []),
    ...(!input.complete ? ['retrieval_incomplete'] : [])]
  const complete = normalized.coverage.retrievalComplete && issues.length === 0 && omitted.length === 0
  return {
    version: 'performed-work-context-1' as const, authority: 'factual_context_only' as const,
    numericPolicyEligible: false as const, userId: input.userId, asOf: input.asOf, mode: input.mode,
    window: { startsOn: input.startsOn, endsOn: input.endsOn },
    status: !input.available ? 'unavailable' as const : !complete ? 'partial' as const
      : records.length ? 'available' as const : 'no_records' as const,
    coverage: { retrievalComplete: normalized.coverage.retrievalComplete, complete, athleteCoverage: 'unknown' as const,
      selectedRecords: normalized.exposures.length, includedRecords: records.length,
      recordBudgetCharacters: RECORD_BUDGET, usedRecordCharacters, omitted, missing, issues },
    records,
  }
}

export type PerformedWorkContext = ReturnType<typeof buildPerformedWorkContext>

/** Agent offset is negated relative to the canonical history reader's raw offset. */
export async function fetchPerformedWorkContextForCoaching(supabase: SupabaseClient, userId: string,
  input: { includeCoachContext: boolean; agentTzOffset: number; asOf: string; windowDays?: number }
): Promise<PerformedWorkContext | undefined> {
  if (!input.includeCoachContext || !personalizedCoachingCapabilities().historyContext) return undefined
  const windowDays = input.windowDays ?? 28
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 180) throw new Error('History window must be between 1 and 180 days')
  const tzOffset = -input.agentTzOffset
  const startDate = formatUTCAsLocalDateWithOffset(input.asOf, tzOffset)
  const startsOn = formatUTCAsLocalDateWithOffset(new Date(Date.parse(localDateToUTCStart(startDate, 0)) - (windowDays - 1) * 86400000).toISOString(), 0)
  try {
    const snapshot = await fetchPlanningHistorySnapshot(supabase, userId, { startDate, asOf: input.asOf, tzOffset, windowDays })
    return buildPerformedWorkContext(snapshot)
  } catch {
    // Never convert an outage or ownership rejection into an empty training history.
    return buildPerformedWorkContext({ userId, asOf: input.asOf, startsOn, endsOn: startDate,
      mode: 'current', workouts: [], completions: [], available: false, complete: false,
      missing: ['performed_work_context_unavailable'] })
  }
}

export function renderPerformedWorkContext(context: PerformedWorkContext, userId: string): string {
  if (!userId || context.userId !== userId) throw new Error('Performed-work ownership mismatch')
  return JSON.stringify(context)
}
