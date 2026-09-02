import {
  ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
  buildObservationComparabilityKey,
  findAssessmentDefinition,
  normalizeMetricValue,
  type PerformanceObservation
} from './adaptive-programming-contracts'
import {
  getMovementsByAssessmentAlias,
  MOVEMENT_CATALOG,
  type MovementDefinition
} from './movement-catalog'

export const QWIK_SOURCE_SYSTEM = 'qwik_vbt' as const
export const QWIK_SOURCE_SCHEMA_VERSION = 'qwik-vbt-json-1.10' as const
export const QWIK_IMPORT_PARSER_VERSION = 'qwik-import-0.1.0' as const
export const QWIK_RAW_STORAGE_POLICY = 'user_retained_not_uploaded' as const
export const QWIK_MAX_RAW_BYTES = 5_000_000 as const
export const QWIK_MAX_NORMALIZED_SUBMISSION_BYTES = 2_200_000 as const

const QWIK_ASSESSMENT_ID = 'strength.fixed_load_velocity'
const SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/
const QWIK_ISSUE_CODES = new Set<string>([
  'invalid_json',
  'invalid_root',
  'unsupported_format',
  'invalid_file',
  'invalid_set',
  'invalid_rep',
  'duplicate_source_id',
  'invalid_time',
  'invalid_load',
  'invalid_rpe',
  'invalid_metric',
  'movement_review_required'
])

export type QwikMovementMappingStatus = 'mapped' | 'ambiguous' | 'unmapped'

export interface QwikImportIssue {
  severity: 'error' | 'warning'
  code:
    | 'invalid_json'
    | 'invalid_root'
    | 'unsupported_format'
    | 'invalid_file'
    | 'invalid_set'
    | 'invalid_rep'
    | 'duplicate_source_id'
    | 'invalid_time'
    | 'invalid_load'
    | 'invalid_rpe'
    | 'invalid_metric'
    | 'movement_review_required'
  path: string
  message: string
  sourceRecordId: string | null
}

export interface QwikRepMeasurement {
  sourceRepId: string
  meanConcentricVelocityMps: number
  peakConcentricVelocityMps: number | null
  meanEccentricVelocityMps: number | null
  peakEccentricVelocityMps: number | null
  concentricDurationSeconds: number | null
  eccentricDurationSeconds: number | null
  pauseDurationSeconds: number | null
  rangeOfMotionMeters: number | null
  barPath: {
    retainedInPrivateRawArtifact: true
    present: boolean
    pointCount: number
  }
}

export interface QwikMovementMapping {
  status: QwikMovementMappingStatus
  canonicalMovementId: string | null
  canonicalMovementName: string | null
  candidateMovementIds: string[]
}

export interface QwikPersistenceValue {
  metricId: 'strength.load' | 'strength.repetitions' | 'bar.mean_velocity'
  semanticRole: 'training_signal' | 'direct_outcome'
  value: number
  unit: 'kg' | 'lb' | 'repetitions' | 'm_per_s'
  ordinal: number
  provenance: Record<string, unknown>
}

export interface QwikNormalizedSet {
  sourceSetId: string
  sourceExercise: string
  observedAt: string
  sourceCapturedAt: string
  workoutDate: string
  originalLoad: { value: number; unit: string }
  normalizedLoad: { value: number; unit: 'kg' }
  rpe: number | null
  notes: string | null
  tags: string[]
  techniqueModifiers: string[]
  velocityLossPercent: number | null
  movementMapping: QwikMovementMapping
  comparison: PerformanceObservation['comparison']
  comparabilityKey: string | null
  reps: QwikRepMeasurement[]
  values: QwikPersistenceValue[]
}

export interface QwikImportPreview {
  sourceSystem: typeof QWIK_SOURCE_SYSTEM
  sourceSchemaVersion: typeof QWIK_SOURCE_SCHEMA_VERSION
  parserVersion: typeof QWIK_IMPORT_PARSER_VERSION
  sourceFileName: string
  sourceFileHash: string
  sourceByteLength: number
  ingestedAt: string
  sourceExportedAt: string | null
  sourceDeviceId: string
  sourcePayloadMetadata: Record<string, unknown>
  rawArtifact: {
    storageKind: 'not_persisted'
    retentionClass: typeof QWIK_RAW_STORAGE_POLICY
    retentionDays: null
    expiresAt: null
    includesBarPathArrays: boolean
  }
  sets: QwikNormalizedSet[]
  issues: QwikImportIssue[]
  canSaveForReview: boolean
}

export interface QwikImportSubmission {
  sourceSystem: typeof QWIK_SOURCE_SYSTEM
  sourceSchemaVersion: typeof QWIK_SOURCE_SCHEMA_VERSION
  parserVersion: typeof QWIK_IMPORT_PARSER_VERSION
  sourceFileName: string
  sourceFileHash: string
  sourceByteLength: number
  ingestedAt: string
  sourceExportedAt: string
  sourceDeviceId: string
  rawStoragePolicy: typeof QWIK_RAW_STORAGE_POLICY
  warnings: QwikImportIssue[]
  sets: Record<string, unknown>[]
}

export interface ParseQwikExportInput {
  sourceFileName: string
  ingestedAt: string
}

export interface ExistingQwikImport {
  id: string
  idempotencyKey: string
  sourceFileHash: string
  parserVersion: string
  status: 'pending_review' | 'confirmed' | 'rejected' | 'failed' | 'superseded'
}

export type QwikImportReplayDecision =
  | { action: 'new' }
  | { action: 'replay'; importId: string }
  | { action: 'duplicate'; importId: string }
  | { action: 'conflict'; importId: string; reason: string }

export async function parseQwikExport(
  rawText: string,
  input: ParseQwikExportInput
): Promise<QwikImportPreview> {
  const issues: QwikImportIssue[] = []
  const sourceFileName = input.sourceFileName.trim()
  const sourceByteLength = utf8ByteLength(rawText)
  const sourceFileHash = await sha256(rawText)
  const ingestedAt = normalizeTimestamp(input.ingestedAt)

  if (!sourceFileName || sourceFileName.length > 255 || !sourceFileName.toLowerCase().endsWith('.json')) {
    addIssue(issues, 'error', 'invalid_file', 'sourceFileName', 'Use a named Qwik JSON export file.', null)
  }
  if (sourceByteLength < 2 || sourceByteLength > QWIK_MAX_RAW_BYTES) {
    addIssue(
      issues,
      'error',
      'invalid_file',
      'rawText',
      `Qwik JSON must be between 2 and ${QWIK_MAX_RAW_BYTES} UTF-8 bytes.`,
      null
    )
  }
  if (!ingestedAt) {
    addIssue(issues, 'error', 'invalid_time', 'ingestedAt', 'Import capture time must be an ISO timestamp.', null)
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(rawText)
  } catch {
    decoded = null
    addIssue(issues, 'error', 'invalid_json', 'rawText', 'The file is not valid JSON.', null)
  }

  const root = isRecord(decoded) ? decoded : null
  if (decoded !== null && !root) {
    addIssue(issues, 'error', 'invalid_root', '$', 'The Qwik export root must be an object.', null)
  }

  const exportFormatVersion = textValue(root?.export_format_version)
  if (root && exportFormatVersion !== '1.10') {
    addIssue(
      issues,
      'error',
      'unsupported_format',
      'export_format_version',
      'Only the fixture-backed Qwik JSON 1.10 export format is supported.',
      null
    )
  }

  const sourceExportedAt = normalizeTimestamp(root?.exported_at)
  if (root && !sourceExportedAt) {
    addIssue(issues, 'error', 'invalid_time', 'exported_at', 'Qwik exported_at must be an ISO timestamp.', null)
  }
  if (
    sourceExportedAt
    && ingestedAt
    && Date.parse(sourceExportedAt) > Date.parse(ingestedAt)
  ) {
    addIssue(issues, 'error', 'invalid_time', 'exported_at', 'Qwik export time cannot be in the future.', null)
  }

  const sourceDeviceId = stableDeviceId(root?.device_id)
  const sourcePayloadMetadata = boundedMetadata(root?.metadata, issues)
  const setRows = Array.isArray(root?.sets) ? root.sets : []
  if (root && !Array.isArray(root.sets)) {
    addIssue(issues, 'error', 'invalid_root', 'sets', 'Qwik sets must be an array.', null)
  } else if (root && setRows.length === 0) {
    addIssue(issues, 'error', 'invalid_root', 'sets', 'The Qwik export does not contain any sets.', null)
  } else if (setRows.length > 1_000) {
    addIssue(issues, 'error', 'invalid_root', 'sets', 'A Qwik import can contain at most 1,000 sets.', null)
  }

  const seenSetIds = new Set<string>()
  const seenRepIds = new Set<string>()
  const sets: QwikNormalizedSet[] = []
  for (const [index, candidate] of setRows.slice(0, 1_000).entries()) {
    const parsed = parseSet({
      candidate,
      index,
      sourceExportedAt,
      sourceDeviceId,
      sourceFileHash,
      issues,
      seenSetIds,
      seenRepIds
    })
    if (parsed) sets.push(parsed)
  }

  const hasErrors = issues.some(issue => issue.severity === 'error')

  return {
    sourceSystem: QWIK_SOURCE_SYSTEM,
    sourceSchemaVersion: QWIK_SOURCE_SCHEMA_VERSION,
    parserVersion: QWIK_IMPORT_PARSER_VERSION,
    sourceFileName,
    sourceFileHash,
    sourceByteLength,
    ingestedAt: ingestedAt ?? new Date(0).toISOString(),
    sourceExportedAt,
    sourceDeviceId,
    sourcePayloadMetadata,
    rawArtifact: {
      storageKind: 'not_persisted',
      retentionClass: QWIK_RAW_STORAGE_POLICY,
      retentionDays: null,
      expiresAt: null,
      includesBarPathArrays: sets.some(set => set.reps.some(rep => rep.barPath.present))
    },
    sets,
    issues,
    canSaveForReview: !hasErrors && sets.length > 0
  }
}

export function decideQwikImportReplay(
  existing: readonly ExistingQwikImport[],
  request: {
    idempotencyKey: string
    sourceFileHash: string
    parserVersion?: string
  }
): QwikImportReplayDecision {
  const parserVersion = request.parserVersion ?? QWIK_IMPORT_PARSER_VERSION
  const sameKey = existing.find(item => item.idempotencyKey === request.idempotencyKey)
  if (sameKey) {
    if (
      sameKey.sourceFileHash !== request.sourceFileHash
      || sameKey.parserVersion !== parserVersion
    ) {
      return {
        action: 'conflict',
        importId: sameKey.id,
        reason: 'The idempotency key already belongs to different Qwik content.'
      }
    }
    return { action: 'replay', importId: sameKey.id }
  }

  const duplicate = existing.find(item => (
    item.sourceFileHash === request.sourceFileHash
    && item.parserVersion === parserVersion
    && (item.status === 'pending_review' || item.status === 'confirmed')
  ))
  return duplicate
    ? { action: 'duplicate', importId: duplicate.id }
    : { action: 'new' }
}

export function qwikSetForPersistence(set: QwikNormalizedSet): Record<string, unknown> {
  return {
    sourceSetId: set.sourceSetId,
    sourceExercise: set.sourceExercise,
    observedAt: set.observedAt,
    capturedAt: set.sourceCapturedAt,
    workoutDate: set.workoutDate,
    mappingStatus: set.movementMapping.status,
    canonicalMovementId: set.movementMapping.canonicalMovementId,
    canonicalMovementName: set.movementMapping.canonicalMovementName,
    candidateMovementIds: set.movementMapping.candidateMovementIds,
    comparabilityKey: set.comparabilityKey,
    comparison: set.comparison,
    rpe: set.rpe,
    notes: set.notes,
    tags: set.tags,
    techniqueModifiers: set.techniqueModifiers,
    velocityLossPercent: set.velocityLossPercent,
    repMetadata: set.reps.map(rep => ({
      sourceRepId: rep.sourceRepId,
      peakConcentricVelocityMps: rep.peakConcentricVelocityMps,
      meanEccentricVelocityMps: rep.meanEccentricVelocityMps,
      peakEccentricVelocityMps: rep.peakEccentricVelocityMps,
      concentricDurationSeconds: rep.concentricDurationSeconds,
      eccentricDurationSeconds: rep.eccentricDurationSeconds,
      pauseDurationSeconds: rep.pauseDurationSeconds,
      rangeOfMotionMeters: rep.rangeOfMotionMeters,
      barPathPresent: rep.barPath.present,
      barPathPointCount: rep.barPath.pointCount
    })),
    values: set.values

  }
}
export function qwikImportForPersistence(preview: QwikImportPreview): QwikImportSubmission {
  if (!preview.canSaveForReview || !preview.sourceExportedAt) {
    throw new Error('Only a valid Qwik preview can be prepared for persistence')
  }
  return {
    sourceSystem: preview.sourceSystem,
    sourceSchemaVersion: preview.sourceSchemaVersion,
    parserVersion: preview.parserVersion,
    sourceFileName: preview.sourceFileName,
    sourceFileHash: preview.sourceFileHash,
    sourceByteLength: preview.sourceByteLength,
    ingestedAt: preview.ingestedAt,
    sourceExportedAt: preview.sourceExportedAt,
    sourceDeviceId: preview.sourceDeviceId,
    rawStoragePolicy: QWIK_RAW_STORAGE_POLICY,
    warnings: preview.issues.filter(issue => issue.severity === 'warning'),
    sets: preview.sets.map(qwikSetForPersistence)
  }
}

export function readQwikImportSubmission(value: unknown): QwikImportSubmission | null {
  if (!isRecord(value)) return null

  let serialized: string
  let clone: Record<string, unknown>
  try {
    serialized = JSON.stringify(value)
    clone = JSON.parse(serialized) as Record<string, unknown>
  } catch {
    return null
  }
  if (
    utf8ByteLength(serialized) > QWIK_MAX_NORMALIZED_SUBMISSION_BYTES
    || /"(?:rawText|bar_path|barPath)"\s*:/.test(serialized)
  ) return null

  if (
    clone.sourceSystem !== QWIK_SOURCE_SYSTEM
    || clone.sourceSchemaVersion !== QWIK_SOURCE_SCHEMA_VERSION
    || clone.parserVersion !== QWIK_IMPORT_PARSER_VERSION
    || clone.rawStoragePolicy !== QWIK_RAW_STORAGE_POLICY
  ) return null

  const sourceFileName = textValue(clone.sourceFileName)
  const sourceFileHash = textValue(clone.sourceFileHash)
  const sourceByteLength = finiteNumber(clone.sourceByteLength)
  const ingestedAt = normalizeTimestamp(clone.ingestedAt)
  const sourceExportedAt = normalizeTimestamp(clone.sourceExportedAt)
  const sourceDeviceId = textValue(clone.sourceDeviceId)
  if (
    !sourceFileName
    || sourceFileName.length > 255
    || !sourceFileName.toLowerCase().endsWith('.json')
    || !sourceFileHash
    || !/^[0-9a-f]{64}$/.test(sourceFileHash)
    || sourceByteLength === null
    || !Number.isInteger(sourceByteLength)
    || sourceByteLength < 2
    || sourceByteLength > QWIK_MAX_RAW_BYTES
    || !ingestedAt
    || !sourceExportedAt
    || Date.parse(sourceExportedAt) > Date.parse(ingestedAt)
    || !sourceDeviceId
    || sourceDeviceId.length > 120
    || !SOURCE_ID_PATTERN.test(sourceDeviceId)
  ) return null

  if (
    !Array.isArray(clone.warnings)
    || clone.warnings.length > 200
    || !Array.isArray(clone.sets)
    || clone.sets.length < 1
    || clone.sets.length > 1_000
  ) return null

  const warnings = clone.warnings.map(readQwikWarning)
  if (warnings.some(warning => warning === null)) return null
  const sets = clone.sets.filter(isRecord)
  if (sets.length !== clone.sets.length) return null

  return {
    sourceSystem: QWIK_SOURCE_SYSTEM,
    sourceSchemaVersion: QWIK_SOURCE_SCHEMA_VERSION,
    parserVersion: QWIK_IMPORT_PARSER_VERSION,
    sourceFileName,
    sourceFileHash,
    sourceByteLength,
    ingestedAt,
    sourceExportedAt,
    sourceDeviceId,
    rawStoragePolicy: QWIK_RAW_STORAGE_POLICY,
    warnings: warnings as QwikImportIssue[],
    sets
  }
}

function readQwikWarning(value: unknown): QwikImportIssue | null {
  if (!isRecord(value) || value.severity !== 'warning') return null
  const code = textValue(value.code)
  const path = textValue(value.path)
  const message = textValue(value.message)
  const sourceRecordId = value.sourceRecordId === null
    ? null
    : textValue(value.sourceRecordId)
  if (
    !code
    || !QWIK_ISSUE_CODES.has(code)
    || !path
    || path.length > 500
    || !message
    || message.length > 2_000
    || (value.sourceRecordId !== null && (!sourceRecordId || sourceRecordId.length > 255))
  ) return null
  return {
    severity: 'warning',
    code: code as QwikImportIssue['code'],
    path,
    message,
    sourceRecordId
  }
}

function parseSet(input: {
  candidate: unknown
  index: number
  sourceExportedAt: string | null
  sourceDeviceId: string
  sourceFileHash: string
  issues: QwikImportIssue[]
  seenSetIds: Set<string>
  seenRepIds: Set<string>
}): QwikNormalizedSet | null {
  const path = `sets[${input.index}]`
  if (!isRecord(input.candidate)) {
    addIssue(input.issues, 'error', 'invalid_set', path, 'Each Qwik set must be an object.', null)
    return null
  }

  const sourceSetId = textValue(input.candidate.set_id)
  if (!sourceSetId || !SOURCE_ID_PATTERN.test(sourceSetId)) {
    addIssue(input.issues, 'error', 'invalid_set', `${path}.set_id`, 'Set ID is missing or invalid.', null)
    return null
  }
  if (input.seenSetIds.has(sourceSetId)) {
    addIssue(
      input.issues,
      'error',
      'duplicate_source_id',
      `${path}.set_id`,
      `Set ID ${sourceSetId} appears more than once.`,
      sourceSetId
    )
    return null
  }
  input.seenSetIds.add(sourceSetId)

  const issueStart = input.issues.length
  const sourceExercise = textValue(input.candidate.exercise)
  if (!sourceExercise || sourceExercise.length > 200) {
    addIssue(input.issues, 'error', 'invalid_set', `${path}.exercise`, 'Exercise is missing or too long.', sourceSetId)
  }

  const observedAt = normalizePerformedTime(input.candidate.date_performed)
  const sourceCapturedAt = normalizeTimestamp(input.candidate.captured_at)
    ?? input.sourceExportedAt
  if (!observedAt) {
    addIssue(
      input.issues,
      'error',
      'invalid_time',
      `${path}.date_performed`,
      'date_performed must be an ISO date or timestamp.',
      sourceSetId
    )
  }
  if (!sourceCapturedAt) {
    addIssue(
      input.issues,
      'error',
      'invalid_time',
      `${path}.captured_at`,
      'Set capture time or export time is required.',
      sourceSetId
    )
  }
  if (observedAt && sourceCapturedAt && Date.parse(sourceCapturedAt) < Date.parse(observedAt)) {
    addIssue(
      input.issues,
      'error',
      'invalid_time',
      `${path}.captured_at`,
      'Set capture time cannot precede date_performed.',
      sourceSetId
    )
  }

  const load = finiteNumber(input.candidate.load)
  const originalUnit = textValue(input.candidate.unit)
  const normalizedUnit = normalizeLoadUnit(originalUnit)
  const normalizedLoad = load !== null && normalizedUnit
    ? normalizeMetricValue({ metricId: 'strength.load', value: load, unit: normalizedUnit })
    : null
  if (load === null || load <= 0 || !originalUnit || !normalizedUnit || !normalizedLoad) {
    addIssue(
      input.issues,
      'error',
      'invalid_load',
      `${path}.load`,
      'Load must be positive and use lb or kg.',
      sourceSetId
    )
  }

  const rpe = optionalRpe(input.candidate.rpe)
  if (rpe === undefined) {
    addIssue(
      input.issues,
      'error',
      'invalid_rpe',
      `${path}.rpe`,
      'RPE must be null or a number from 1 through 10.',
      sourceSetId
    )
  }
  const notes = optionalText(input.candidate.notes, 2_000)
  if (notes === undefined) {
    addIssue(input.issues, 'error', 'invalid_set', `${path}.notes`, 'Notes must be null or text.', sourceSetId)
  }
  const tags = stringArray(input.candidate.tags)
  if (!tags) {
    addIssue(input.issues, 'error', 'invalid_set', `${path}.tags`, 'Tags must be an array of text.', sourceSetId)
  }
  const velocityLossPercent = optionalBoundedNumber(input.candidate.velocity_loss_percent, 0, 100)
  if (velocityLossPercent === undefined) {
    addIssue(
      input.issues,
      'error',
      'invalid_metric',
      `${path}.velocity_loss_percent`,
      'Velocity loss must be null or a percentage from 0 through 100.',
      sourceSetId
    )
  }

  const repRows = Array.isArray(input.candidate.reps) ? input.candidate.reps : []
  if (!Array.isArray(input.candidate.reps) || repRows.length === 0 || repRows.length > 100) {
    addIssue(
      input.issues,
      'error',
      'invalid_set',
      `${path}.reps`,
      'A Qwik set must contain 1 through 100 repetitions.',
      sourceSetId
    )
  }
  const reps: QwikRepMeasurement[] = []
  for (const [repIndex, rep] of repRows.slice(0, 100).entries()) {
    const parsedRep = parseRep(rep, `${path}.reps[${repIndex}]`, sourceSetId, input.issues)
    if (!parsedRep) continue
    if (input.seenRepIds.has(parsedRep.sourceRepId)) {
      addIssue(
        input.issues,
        'error',
        'duplicate_source_id',
        `${path}.reps[${repIndex}].rep_id`,
        `Rep ID ${parsedRep.sourceRepId} appears more than once.`,
        sourceSetId
      )
      continue
    }
    input.seenRepIds.add(parsedRep.sourceRepId)
    reps.push(parsedRep)
  }

  const rowErrors = input.issues.slice(issueStart).some(issue => issue.severity === 'error')
  if (
    rowErrors
    || !sourceExercise
    || !observedAt
    || !sourceCapturedAt
    || load === null
    || load <= 0
    || !originalUnit
    || !normalizedUnit
    || !normalizedLoad
    || rpe === undefined
    || notes === undefined
    || !tags
    || velocityLossPercent === undefined
    || reps.length !== repRows.length
    || reps.length === 0
  ) return null

  const mapping = mapMovement(sourceExercise, input.issues, path, sourceSetId)
  const techniqueModifiers = techniqueModifiersFromTags(tags)
  const comparison = comparisonFor(mapping, normalizedLoad.value, techniqueModifiers, reps.length)
  const comparabilityKey = buildSetComparabilityKey({
    sourceSetId,
    sourceFileHash: input.sourceFileHash,
    sourceDeviceId: input.sourceDeviceId,
    observedAt,
    sourceCapturedAt,
    reps,
    mapping,
    comparison
  })
  const values: QwikPersistenceValue[] = [
    {
      metricId: 'strength.load',
      semanticRole: 'training_signal',
      value: load,
      unit: normalizedUnit,
      ordinal: 0,
      provenance: {
        sourceField: 'load',
        originalValue: load,
        originalUnit,
        canonicalValue: normalizedLoad.value,
        canonicalUnit: normalizedLoad.unit
      }
    },
    {
      metricId: 'strength.repetitions',
      semanticRole: 'training_signal',
      value: reps.length,
      unit: 'repetitions',
      ordinal: 0,
      provenance: { sourceField: 'reps', sourceRepIds: reps.map(rep => rep.sourceRepId) }
    },
    ...reps.map((rep, ordinal): QwikPersistenceValue => ({
      metricId: 'bar.mean_velocity',
      semanticRole: 'direct_outcome',
      value: rep.meanConcentricVelocityMps,
      unit: 'm_per_s',
      ordinal,
      provenance: {
        sourceField: 'reps.concentric.mean_velocity_mps',
        sourceRepId: rep.sourceRepId,
        originalValue: rep.meanConcentricVelocityMps,
        originalUnit: 'm_per_s'
      }
    }))
  ]

  return {
    sourceSetId,
    sourceExercise,
    observedAt,
    sourceCapturedAt,
    workoutDate: observedAt.slice(0, 10),
    originalLoad: { value: load, unit: originalUnit },
    normalizedLoad: { value: normalizedLoad.value, unit: 'kg' },
    rpe,
    notes,
    tags,
    techniqueModifiers,
    velocityLossPercent,
    movementMapping: mapping,
    comparison,
    comparabilityKey,
    reps,
    values
  }
}

function parseRep(
  candidate: unknown,
  path: string,
  sourceSetId: string,
  issues: QwikImportIssue[]
): QwikRepMeasurement | null {
  if (!isRecord(candidate)) {
    addIssue(issues, 'error', 'invalid_rep', path, 'Each Qwik repetition must be an object.', sourceSetId)
    return null
  }
  const sourceRepId = textValue(candidate.rep_id)
  const concentric = isRecord(candidate.concentric) ? candidate.concentric : null
  const eccentric = isRecord(candidate.eccentric) ? candidate.eccentric : null
  const pause = isRecord(candidate.pause) ? candidate.pause : null
  const meanConcentricVelocityMps = finiteNumber(concentric?.mean_velocity_mps)
  const peakConcentricVelocityMps = optionalNonNegativeNumber(concentric?.peak_velocity_mps)
  const meanEccentricVelocityMps = optionalNonNegativeNumber(eccentric?.mean_velocity_mps)
  const peakEccentricVelocityMps = optionalNonNegativeNumber(eccentric?.peak_velocity_mps)
  const concentricDurationSeconds = optionalNonNegativeNumber(concentric?.duration_seconds)
  const eccentricDurationSeconds = optionalNonNegativeNumber(eccentric?.duration_seconds)
  const pauseDurationSeconds = optionalNonNegativeNumber(pause?.duration_seconds)
  const rangeOfMotionMeters = optionalNonNegativeNumber(candidate.range_of_motion_meters)
  const barPath = Array.isArray(candidate.bar_path) ? candidate.bar_path : null
  const optionalMetrics = [
    peakConcentricVelocityMps,
    meanEccentricVelocityMps,
    peakEccentricVelocityMps,
    concentricDurationSeconds,
    eccentricDurationSeconds,
    pauseDurationSeconds,
    rangeOfMotionMeters
  ]

  if (!sourceRepId || !SOURCE_ID_PATTERN.test(sourceRepId)) {
    addIssue(issues, 'error', 'invalid_rep', `${path}.rep_id`, 'Rep ID is missing or invalid.', sourceSetId)
  }
  if (meanConcentricVelocityMps === null || meanConcentricVelocityMps <= 0) {
    addIssue(
      issues,
      'error',
      'invalid_metric',
      `${path}.concentric.mean_velocity_mps`,
      'Mean concentric velocity must be positive.',
      sourceSetId
    )
  }
  if (optionalMetrics.some(metric => metric === undefined)) {
    addIssue(
      issues,
      'error',
      'invalid_metric',
      path,
      'Optional concentric, eccentric, pause, and range metrics must be non-negative numbers.',
      sourceSetId
    )
  }
  if (candidate.bar_path !== undefined && candidate.bar_path !== null && !barPath) {
    addIssue(issues, 'error', 'invalid_rep', `${path}.bar_path`, 'Bar path must be an array.', sourceSetId)
  }

  if (
    !sourceRepId
    || !SOURCE_ID_PATTERN.test(sourceRepId)
    || meanConcentricVelocityMps === null
    || meanConcentricVelocityMps <= 0
    || optionalMetrics.some(metric => metric === undefined)
    || (candidate.bar_path !== undefined && candidate.bar_path !== null && !barPath)
  ) return null

  return {
    sourceRepId,
    meanConcentricVelocityMps,
    peakConcentricVelocityMps: peakConcentricVelocityMps ?? null,
    meanEccentricVelocityMps: meanEccentricVelocityMps ?? null,
    peakEccentricVelocityMps: peakEccentricVelocityMps ?? null,
    concentricDurationSeconds: concentricDurationSeconds ?? null,
    eccentricDurationSeconds: eccentricDurationSeconds ?? null,
    pauseDurationSeconds: pauseDurationSeconds ?? null,
    rangeOfMotionMeters: rangeOfMotionMeters ?? null,
    barPath: {
      retainedInPrivateRawArtifact: true,
      present: barPath !== null && barPath.length > 0,
      pointCount: barPath?.length ?? 0
    }
  }
}

function mapMovement(
  sourceExercise: string,
  issues: QwikImportIssue[],
  path: string,
  sourceSetId: string
): QwikMovementMapping {
  const candidates = getMovementsByAssessmentAlias(sourceExercise)
  if (candidates.length === 1) return mappedMovement(candidates[0])

  const candidateMovementIds = candidates.map(candidate => candidate.id).sort()
  addIssue(
    issues,
    'warning',
    'movement_review_required',
    `${path}.exercise`,
    candidates.length > 1
      ? `Exercise ${sourceExercise} matches multiple canonical movements.`
      : `Exercise ${sourceExercise} does not match the canonical movement catalog.`,
    sourceSetId
  )
  return {
    status: candidates.length > 1 ? 'ambiguous' : 'unmapped',
    canonicalMovementId: null,
    canonicalMovementName: null,
    candidateMovementIds
  }
}

function mappedMovement(movement: MovementDefinition): QwikMovementMapping {
  return {
    status: 'mapped',
    canonicalMovementId: movement.id,
    canonicalMovementName: movement.name,
    candidateMovementIds: [movement.id]
  }
}

function comparisonFor(
  mapping: QwikMovementMapping,
  normalizedLoadKg: number,
  techniqueModifiers: string[],
  repetitions: number
): PerformanceObservation['comparison'] {
  const movement = mapping.canonicalMovementId
    ? MOVEMENT_CATALOG.find(candidate => candidate.id === mapping.canonicalMovementId) ?? null
    : null
  return {
    movementId: movement?.id ?? null,
    variationId: movement?.progressionFamily ?? null,
    repetitions,
    externalLoad: { value: normalizedLoadKg, unit: 'kg' },
    distance: null,
    duration: null,
    equipmentIds: movement ? [...movement.equipment] : [],
    techniqueModifiers,
    environmentModifiers: []
  }
}

function buildSetComparabilityKey(input: {
  sourceSetId: string
  sourceFileHash: string
  sourceDeviceId: string
  observedAt: string
  sourceCapturedAt: string
  reps: QwikRepMeasurement[]
  mapping: QwikMovementMapping
  comparison: PerformanceObservation['comparison']
}): string | null {
  if (input.mapping.status !== 'mapped' || input.reps.length === 0) return null
  const definition = findAssessmentDefinition(QWIK_ASSESSMENT_ID)
  if (!definition) return null

  const observation: PerformanceObservation = {
    schemaVersion: ADAPTIVE_PROGRAMMING_SCHEMA_VERSION,
    id: `qwik:${input.sourceSetId}`,
    kind: definition.observationKind,
    semanticRole: 'direct_outcome',
    status: 'complete',
    metric: {
      metricId: 'bar.mean_velocity',
      value: input.reps[0].meanConcentricVelocityMps,
      unit: 'm_per_s'
    },
    observedAt: input.observedAt,
    capturedAt: input.sourceCapturedAt,
    assessmentDefinition: { id: definition.id, version: definition.version },
    protocol: { id: definition.protocol.id, version: definition.protocol.version },
    source: {
      kind: 'import',
      system: QWIK_SOURCE_SYSTEM,
      recordId: input.sourceSetId,
      fingerprint: input.sourceFileHash,
      deviceId: input.sourceDeviceId
    },
    comparison: input.comparison,
    completion: { missingFields: [] },
    exclusion: null,
    supersededByObservationId: null,
    derivedFromObservationIds: []
  }
  const result = buildObservationComparabilityKey(observation)
  return result.ok ? result.key : null
}

function techniqueModifiersFromTags(tags: readonly string[]): string[] {
  const normalized = tags.map(tag => normalizeTag(tag))
  const modifiers = new Set<string>()
  if (normalized.some(tag => tag.includes('pause'))) modifiers.add('paused')
  if (normalized.some(tag => tag.includes('tempo') || tag.includes('eccentric'))) modifiers.add('tempo')
  if (normalized.some(tag => tag.includes('touch and go') || tag.includes('touch_and_go'))) {
    modifiers.add('touch_and_go')
  }
  return [...modifiers].sort()
}

function boundedMetadata(value: unknown, issues: QwikImportIssue[]): Record<string, unknown> {
  if (value === undefined || value === null) return {}
  if (!isRecord(value)) {
    addIssue(issues, 'error', 'invalid_root', 'metadata', 'Qwik metadata must be an object.', null)
    return {}
  }
  try {
    const serialized = JSON.stringify(value)
    if (utf8ByteLength(serialized) > 10_000) {
      addIssue(
        issues,
        'warning',
        'invalid_root',
        'metadata',
        'Oversized source metadata was omitted from the normalized preview.',
        null
      )
      return {}
    }
    return JSON.parse(serialized) as Record<string, unknown>
  } catch {
    addIssue(issues, 'error', 'invalid_root', 'metadata', 'Qwik metadata must be JSON-safe.', null)
    return {}
  }
}

function addIssue(
  issues: QwikImportIssue[],
  severity: QwikImportIssue['severity'],
  code: QwikImportIssue['code'],
  path: string,
  message: string,
  sourceRecordId: string | null
): void {
  issues.push({ severity, code, path, message, sourceRecordId })
}

function normalizeLoadUnit(value: string | null): 'kg' | 'lb' | null {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'kg' || normalized === 'kgs' || normalized === 'kilogram' || normalized === 'kilograms') {
    return 'kg'
  }
  if (
    normalized === 'lb'
    || normalized === 'lbs'
    || normalized === 'pound'
    || normalized === 'pounds'
  ) return 'lb'
  return null
}

function normalizePerformedTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const timestamp = `${trimmed}T12:00:00.000Z`
    return Number.isNaN(Date.parse(timestamp)) ? null : timestamp
  }
  return normalizeTimestamp(trimmed)
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) return null
  const timestamp = Date.parse(trimmed)
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString()
}

function stableDeviceId(value: unknown): string {
  const source = textValue(value)?.toLowerCase() ?? 'qwik_vbt_app'
  const normalized = source
    .replace(/[^a-z0-9._:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120)
  return normalized && /^[a-z0-9]/.test(normalized) ? normalized : 'qwik_vbt_app'
}

function optionalRpe(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null
  const parsed = finiteNumber(value)
  return parsed !== null && parsed >= 1 && parsed <= 10 ? parsed : undefined
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length <= maxLength ? trimmed || null : undefined
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return null
  const normalized = value
    .map(item => item.trim())
    .filter(Boolean)
  return normalized.length <= 40 && normalized.every(item => item.length <= 80)
    ? [...new Set(normalized)]
    : null
}

function optionalNonNegativeNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null
  const parsed = finiteNumber(value)
  return parsed !== null && parsed >= 0 ? parsed : undefined
}

function optionalBoundedNumber(
  value: unknown,
  minimum: number,
  maximum: number
): number | null | undefined {
  if (value === null || value === undefined || value === '') return null
  const parsed = finiteNumber(value)
  return parsed !== null && parsed >= minimum && parsed <= maximum ? parsed : undefined
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ')
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
