import type { PlanningHistorySnapshot } from './planning-context'
import { buildPerformedWorkContext } from './performed-work-context'
import { historyFieldProvenance, resolveHistorySnapshot } from './planning-history'
import type { EvidenceQuantity } from './performed-dose-evidence'

const BUDGET = 64_000
const MAX_NOTICES = 128
type ObjectValue = Record<string, unknown>
const object = (v: unknown): v is ObjectValue => Boolean(v && typeof v === 'object' && !Array.isArray(v))
const has = (v: ObjectValue, key: string) => Object.prototype.hasOwnProperty.call(v, key)

function quantity(value: unknown, sourcePath: string, whole = false): EvidenceQuantity {
  const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && (!whole || Number.isInteger(n))
  if (valid(value)) return { kind: 'exact', value, sourcePath }
  if (object(value) && valid(value.min) && valid(value.max) && value.min <= value.max) {
    return value.min === value.max ? { kind: 'exact', value: value.min, sourcePath }
      : { kind: 'bounded', min: value.min, max: value.max, sourcePath }
  }
  return { kind: 'unknown', reason: value === undefined || value === null ? 'not_recorded' : 'invalid_or_unsupported_quantity', sourcePath }
}

/** External factual compatibility only. Shared numeric/compiler/planning readers are unchanged. */
export function buildExternalPerformedWorkContext(input: PlanningHistorySnapshot) {
  const base = buildPerformedWorkContext(input)
  const resolved = resolveHistorySnapshot({ ...input, revisions: input.revisions ?? [] })
  type Notice = { sourceId: string; sourcePath: string; reason: string }
  const addedOmissions: Notice[] = []
  let additionalOmissions = 0
  const omit = (sourceId: string, sourcePath: string, reason: string) => {
    if (addedOmissions.length < MAX_NOTICES) addedOmissions.push({ sourceId, sourcePath: sourcePath.slice(0, 400), reason })
    else additionalOmissions++
  }
  // Only named workout fields leave the source; unexpected metadata is accounted for.
  const fields = (value: unknown, allowed: string[], path: string, id: string, skip: string[] = []): ObjectValue | null => {
    if (value === undefined || value === null) return null
    if (!object(value)) { omit(id, path, 'invalid_recorded_object'); return null }
    for (const key of Object.keys(value)) if (!allowed.includes(key)) omit(id, `${path}.${key}`, 'unsupported_recorded_field')
    const nested = ['segments', 'events', 'performed', 'prescribed', 'load', 'distance', 'subreps', 'rep_range', 'set_details', 'score_model', 'block_score']
    const strings = ['movement_name', 'title', 'block_type', 'scoring', 'unit', 'rx_status']
    return Object.fromEntries(allowed.filter(key => {
      if (!has(value, key) || skip.includes(key)) return false
      const leaf = value[key]
      if (leaf === null || nested.includes(key)) return true
      const valid = strings.includes(key) ? typeof leaf === 'string' : key === 'is_pr' ? typeof leaf === 'boolean'
        : typeof leaf === 'number' && Number.isFinite(leaf)
      if (!valid) omit(id, `${path}.${key}`, 'unsupported_recorded_scalar_shape')
      return valid
    }).map(key => [key, structuredClone(value[key])]))
  }
  const leafProvenance = (value: unknown, sourcePath: string, capture: unknown, fallback: string) => {
    const defaultValue = historyFieldProvenance(capture, fallback, fallback)
    const overrides: Record<string, typeof defaultValue> = {}
    const visit = (part: unknown, path: string) => {
      if (Array.isArray(part)) part.forEach((child, index) => visit(child, `${path}[${index}]`))
      else if (object(part)) Object.entries(part).forEach(([key, child]) => visit(child, `${path}.${key}`))
      else {
        const provenance = historyFieldProvenance(capture, path, fallback)
        if (provenance.origin !== defaultValue.origin || provenance.reviewState !== defaultValue.reviewState) overrides[path] = provenance
      }
    }
    visit(value, sourcePath)
    return { scope: 'retained_scalar_leaves' as const, default: defaultValue, overrides }
  }
  const amounts = (value: unknown, path: string, id: string) => {
    const result = fields(value, ['reps', 'sets', 'load', 'distance', 'time_s', 'rep_range', 'subreps', 'set_details'], path, id)
    if (!result) return null
    for (const key of ['load', 'distance', 'subreps', 'rep_range']) if (has(result, key)) {
      result[key] = fields(result[key], key === 'rep_range' ? ['min', 'max'] : ['value', 'unit'], `${path}.${key}`, id)
    }
    if (has(result, 'set_details')) {
      if (!Array.isArray(result.set_details)) { omit(id, `${path}.set_details`, 'invalid_recorded_set_details'); result.set_details = null }
      else result.set_details = result.set_details.map((set, index) => {
        const setPath = `${path}.set_details[${index}]`
        if (!object(set)) { omit(id, setPath, 'invalid_recorded_set_detail'); return null }
        const projected = fields(set, ['reps', 'sets', 'legs', 'reps_per_leg', 'load'], setPath, id)
        if (projected && has(projected, 'load')) projected.load = fields(projected.load, ['value', 'unit'], `${setPath}.load`, id)
        return projected
      })
    }
    return result
  }
  const nativeRecords = [...base.records]
  const segmentedRecords: Array<{
    recordKind: 'segmented_logged_event'; sourceId: string; workoutId: string; sourcePath: string
    date: string; capturedAt: string; revision: number | null; snapshotId: string | null
    completionId: null; sessionId: null; movementId: null; recordedName: string; role: 'unknown'
    basis: 'reported_work' | 'legacy_unknown' | 'estimated_work'; origin: string; reviewState: string
    completionState: 'not_independently_verified'; recordedWeight: null
    quantities: { sets: EvidenceQuantity; repetitions: EvidenceQuantity; load: EvidenceQuantity; durationMinutes: EvidenceQuantity }
    loadUnit: 'lb' | 'kg' | null
    blockContextPath: string; segmentContext: { sourcePath: string; recordedRounds: unknown; roundsProvenance: ReturnType<typeof historyFieldProvenance> }
    recordedEvent: { performed: ObjectValue; prescribed: ObjectValue | null }
    recordedFieldProvenance: ReturnType<typeof leafProvenance>; nameProvenance: ReturnType<typeof historyFieldProvenance>
    limitations: string[]
  }> = []
  const blockContexts: Array<{ workoutId: string; sourcePath: string; origin: string; reviewState: string;
    authority: 'unverified_recorded_block_context'; recorded: ObjectValue; fieldProvenance: ReturnType<typeof leafProvenance> }> = []
  const handled = new Set<string>(), ambiguous = new Set<string>()
  const adaptedWorkouts = new Set<string>()
  let selectedEvents = 0
  for (const row of resolved.workouts) {
    const blocks = Array.isArray(row.blocks) ? row.blocks : object(row.blocks) && Array.isArray(row.blocks.blocks) ? row.blocks.blocks : []
    blocks.forEach((block, index) => {
      if (object(block) && has(block, 'segments') && (has(block, 'movements') || has(block, 'exercises'))) ambiguous.add(`${row.id}:${index}`)
    })
  }
  const retainedNative = nativeRecords.filter(record => ![...ambiguous].some(identity => {
    const split = identity.lastIndexOf(':'), id = identity.slice(0, split), bi = identity.slice(split + 1)
    return record.workoutId === id && (record.sourcePath.startsWith(`blocks[${bi}].`) || record.sourcePath.startsWith(`blocks.blocks[${bi}].`))
  }))
  let used = retainedNative.reduce((sum, record) => sum + JSON.stringify(record).length, 0)
  const fit = (value: unknown, id: string, path: string) => {
    const size = JSON.stringify(value).length
    if (used + size > BUDGET) { omit(id, path, 'record_budget'); return false }
    used += size; return true
  }
  for (const row of resolved.workouts) {
    // Reuse the existing normalizer's date, capture, completion and identity gates.
    // Unknown future issue kinds fail closed instead of admitting a source by default.
    if (!input.available || base.coverage.issues.some(issue => issue.sourceId === row.id
      && !/^(unsupported_block:|unsupported_block_entries:|unsupported_exercise:|ambiguous_block_representation:)/.test(issue.reason)
      && issue.reason !== 'no_supported_exercise_entries'
      && issue.reason !== 'completion_does_not_confirm_current_prescription_snapshot')) continue
    const blocks = Array.isArray(row.blocks) ? row.blocks : object(row.blocks) && Array.isArray(row.blocks.blocks) ? row.blocks.blocks : []
    const root = Array.isArray(row.blocks) ? 'blocks' : 'blocks.blocks'
    if (object(row.blocks) && Array.isArray(row.blocks.blocks)) fields(row.blocks, ['blocks'], 'blocks', row.id, ['blocks'])
    for (const [bi, block] of blocks.entries()) {
      if (!object(block) || !has(block, 'segments')) continue
      const blockPath = `${root}[${bi}]`, identity = `${row.id}:${bi}`
      if (has(block, 'movements') || has(block, 'exercises')) {
        ambiguous.add(identity); omit(row.id, blockPath, 'ambiguous_segmented_block_representation'); continue
      }
      if (!Array.isArray(block.segments) || !block.segments.length) { omit(row.id, blockPath, 'invalid_or_empty_segments'); continue }
      if (row.execution_source === 'program_runner') { omit(row.id, blockPath, 'unsupported_segmented_program_runner_contract'); continue }
      const provenance = historyFieldProvenance(row.capture_provenance, blockPath)
      if (['copied_template', 'imported_unverified'].includes(provenance.origin) && provenance.reviewState === 'unreviewed') {
        omit(row.id, blockPath, 'unreviewed_template_or_import'); continue
      }
      const metadata = fields(block, ['title', 'block_type', 'time_cap_s', 'score_model', 'block_score', 'segments'], blockPath, row.id, ['segments'])!
      if (has(metadata, 'score_model')) metadata.score_model = fields(metadata.score_model, ['scoring', 'round_rep_bundle'], `${blockPath}.score_model`, row.id)
      if (has(metadata, 'block_score')) metadata.block_score = fields(metadata.block_score,
        ['rounds_completed', 'extra_reps', 'total_reps', 'time_s', 'tonnage_lb', 'rx_status', 'is_pr'], `${blockPath}.block_score`, row.id)
      const context = { workoutId: row.id, sourcePath: blockPath, ...provenance,
        authority: 'unverified_recorded_block_context' as const, recorded: metadata,
        fieldProvenance: leafProvenance(metadata, blockPath, row.capture_provenance, 'blocks') }
      if (!fit(context, row.id, blockPath)) continue
      blockContexts.push(context)
      handled.add(identity)
      for (const [si, segment] of block.segments.entries()) {
        const segmentPath = `${blockPath}.segments[${si}]`
        if (!object(segment) || !Array.isArray(segment.events) || !segment.events.length) { omit(row.id, segmentPath, 'invalid_or_empty_segment_events'); continue }
        const segmentMetadata = fields(segment, ['rounds', 'events'], segmentPath, row.id, ['events'])!
        for (const [ei, event] of segment.events.entries()) {
          const path = `${segmentPath}.events[${ei}]`
          selectedEvents++
          const projected = fields(event, ['movement_name', 'performed', 'prescribed'], path, row.id)
          if (!projected || typeof projected.movement_name !== 'string' || !projected.movement_name.trim()) { omit(row.id, path, 'invalid_recorded_event_name'); continue }
          const eventProvenance = historyFieldProvenance(row.capture_provenance, path)
          if (['copied_template', 'imported_unverified'].includes(eventProvenance.origin) && eventProvenance.reviewState === 'unreviewed') { omit(row.id, path, 'unreviewed_template_or_import'); continue }
          const performed = amounts(projected.performed, `${path}.performed`, row.id)
          const prescribed = amounts(projected.prescribed, `${path}.prescribed`, row.id)
          if (!performed || !Object.values(performed).some(value => value !== null && value !== undefined)) { omit(row.id, path, 'no_reported_performance'); continue }
          const load = object(performed.load) ? performed.load : null
          const reps = performed.reps == null && object(performed.rep_range) ? performed.rep_range : performed.reps
          const repPath = `${path}.performed.${performed.reps == null && object(performed.rep_range) ? 'rep_range' : 'reps'}`
          const quantities = { sets: quantity(performed.sets, `${path}.performed.sets`, true),
            repetitions: quantity(reps, repPath, true), load: quantity(load?.value, `${path}.performed.load.value`),
            durationMinutes: { kind: 'unknown' as const, reason: 'recorded_seconds_not_converted_to_minutes', sourcePath: `${path}.performed.time_s` } }
          if (performed.reps != null && performed.rep_range != null) {
            quantities.repetitions = { kind: 'unknown', reason: 'multiple_recorded_repetition_forms', sourcePath: `${path}.performed` }
            omit(row.id, `${path}.performed`, 'ambiguous_recorded_repetitions')
          }
          const record = { recordKind: 'segmented_logged_event' as const, sourceId: `workout:${row.id}`, workoutId: row.id, sourcePath: path,
            date: row.workout_date, capturedAt: row.historySnapshotAt, revision: row.capture_revision ?? row.execution_revision ?? null,
            snapshotId: row.historySnapshotId, completionId: null, sessionId: null, movementId: null,
            recordedName: projected.movement_name, role: 'unknown' as const,
            basis: eventProvenance.origin === 'athlete_reported' ? 'reported_work' as const : eventProvenance.origin === 'legacy_unknown' ? 'legacy_unknown' as const : 'estimated_work' as const,
            ...eventProvenance, completionState: 'not_independently_verified' as const, recordedWeight: null,
            quantities, loadUnit: load?.unit === 'lb' ? 'lb' as const : load?.unit === 'kg' ? 'kg' as const : null,
            blockContextPath: blockPath, segmentContext: { sourcePath: segmentPath, recordedRounds: segmentMetadata.rounds ?? null,
              roundsProvenance: historyFieldProvenance(row.capture_provenance, `${segmentPath}.rounds`, 'quantities') },
            recordedEvent: { performed, prescribed },
            recordedFieldProvenance: leafProvenance({ performed, prescribed }, path, row.capture_provenance, 'quantities'),
            nameProvenance: historyFieldProvenance(row.capture_provenance, `${path}.movement_name`),
            limitations: ['See segmentedEventLimitations; no numeric-policy authority.'] }
          if (fit(record, row.id, path)) { segmentedRecords.push(record); adaptedWorkouts.add(row.id) }
        }
      }
    }
  }
  const issues = base.coverage.issues.filter(issue => {
    const match = /^unsupported_block_entries:(\d+)$/.exec(issue.reason)
    return !(match && handled.has(`${issue.sourceId}:${match[1]}`))
      && !(issue.reason === 'no_supported_exercise_entries' && adaptedWorkouts.has(issue.sourceId))
  })
  const omitted = [...base.coverage.omitted, ...addedOmissions]
  const records = [...retainedNative, ...segmentedRecords]
  const complete = base.coverage.retrievalComplete && !issues.length && !omitted.length && !additionalOmissions
  return { ...base, externalProjectionVersion: 'segmented-logged-events-1' as const, records, blockContexts,
    segmentedEventLimitations: ['Stored event amounts are unverified reports/estimates, not independently confirmed execution.',
      'Rounds, set details, per-leg counts and block scores are not multiplied, summed or assigned to individual events.',
      'Block is_pr is an unverified stored claim. Time and distance retain recorded units; movement identity is unresolved.',
      'Recorded field provenance defaults apply only to retained scalar leaves; exact source-path overrides take precedence.'],
    status: !input.available ? 'unavailable' as const : !complete ? 'partial' as const : records.length ? 'available' as const : 'no_records' as const,
    coverage: { ...base.coverage, complete, selectedRecords: base.coverage.selectedRecords + selectedEvents,
      includedRecords: records.length, recordBudgetCharacters: BUDGET, usedRecordCharacters: used,
      omitted, additionalOmissions, issues } }
}
