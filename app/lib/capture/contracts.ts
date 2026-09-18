/** Capture facts and review are independent. Confirmation never changes an estimate's origin. */
export type ActivityKind = 'meal' | 'workout'
export type CaptureOrigin = 'athlete_reported' | 'model_estimated' | 'copied_template' | 'imported_unverified' | 'legacy_unknown'
export type CaptureReviewState = 'unreviewed' | 'athlete_confirmed' | 'corrected'
export type CaptureState = 'draft' | 'saving' | 'queued' | 'saved' | 'save_unconfirmed' | 'correction_pending'
export type CaptureInputMethod = 'text' | 'voice' | 'photo' | 'template' | 'catalog' | 'manual' | 'coach' | 'program'
export interface CaptureFieldProvenance {
  origin: CaptureOrigin
  reviewState: CaptureReviewState
  sourceReferences: string[]
}
export interface CaptureProvenance {
  schemaVersion: 1
  occurrence: CaptureFieldProvenance
  fields: Record<string, CaptureFieldProvenance>
}
export interface CaptureReceipt {
  schemaVersion: 2
  userId: string
  requestId: string
  requestKey: string
  operationId: string
  entityKind: ActivityKind
  entityId: string
  revision: number
  eventAt: string
  eventPrecision?: 'date' | 'timestamp'
  capturedAt: string
  inputMethod: CaptureInputMethod
  state: 'saved'
  provenance: CaptureProvenance
  recommendationId: string | null
}
export interface CaptureOperation {
  sourceItemId: string
  kind: ActivityKind
  record: Record<string, unknown>
  blocks: Record<string, unknown>[]
  provenance: CaptureProvenance
  inputMethod: CaptureInputMethod
  eventAt: string
  eventPrecision?: 'date' | 'timestamp'
  eventTimezoneOffset?: number
  recommendationId?: string | null
  response?: Record<string, unknown>
}
export interface CaptureRequestItem {
  id: string
  source_item_id: string
  kind: ActivityKind
  status: 'pending' | 'committed' | 'canceled'
  cancellation?: { state: 'canceled'; noWriteConfirmed: true }
  receipt: CaptureReceipt | null
}
export interface CaptureReceiptBundle {
  schemaVersion: 2
  requestId: string
  state: 'saved' | 'save_unconfirmed' | 'draft'
  receipts: CaptureReceipt[]
  unresolved: Array<{ operationId: string; sourceItemId: string; state: 'save_unconfirmed' | 'draft' }>
}

export function captureProvenance(kind: ActivityKind, origin: CaptureOrigin = 'model_estimated',
  reviewState: CaptureReviewState = 'unreviewed', sources: string[] = []): CaptureProvenance {
  const field = (): CaptureFieldProvenance => ({ origin, reviewState, sourceReferences: [...sources] })
  return { schemaVersion: 1,
    occurrence: { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [...sources] },
    fields: Object.fromEntries((kind === 'meal' ? ['items', 'quantities', 'macros'] : ['blocks', 'quantities', 'rpe']).map(key => [key, field()])) }
}

export function correctedProvenance(previous: CaptureProvenance, fields: string[], source: string): CaptureProvenance {
  return { ...previous, fields: { ...previous.fields, ...Object.fromEntries(fields.map(key => [key, {
    origin: previous.fields[key]?.origin ?? 'legacy_unknown', reviewState: 'corrected',
    sourceReferences: [...(previous.fields[key]?.sourceReferences ?? []), source]
  }])) } }
}
