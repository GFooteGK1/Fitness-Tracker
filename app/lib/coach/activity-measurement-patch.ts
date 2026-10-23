import { CoachingContextError, contextObject } from './coaching-context'
import type { CaptureProvenance } from '../capture/contracts'
import { historyFieldProvenance } from './planning-history'
import { isRepRecording, type RepRecording } from './rep-recording'
import { canonicalActivityJson } from './activity-record-contract'

function target(updated: unknown, patch: Record<string, any>) {
  const { blockIndex: bi, segmentIndex: si, eventIndex: ei, collection, setIndex: index } = patch
  const block = Array.isArray(updated) ? updated[bi] : undefined
  const segment = contextObject(block) && Array.isArray(block.segments) ? block.segments[si] : undefined
  const event = contextObject(segment) && Array.isArray(segment.events) ? segment.events[ei] : undefined
  const sets = contextObject(event) && contextObject(event.performed) ? event.performed[collection] : undefined
  const set = Array.isArray(sets) ? sets[index] : undefined
  if (!contextObject(set) || Object.hasOwn(set, 'velocity') && set.velocity !== null && !contextObject(set.velocity)) {
    throw new CoachingContextError(400, 'Measurement path must select an existing performed set with object/null/absent velocity')
  }
  return { set, path: `blocks[${bi}].segments[${si}].events[${ei}].performed.${collection}[${index}].velocity` }
}

/** Paths identify existing source positions at the caller's expected workout revision.
 * No movement-name matching, array conversion, synthetic IDs or missing-set creation. */
export function patchSetMeasurements(blocks: unknown, patches: Record<string, any>[], provenance: CaptureProvenance) {
  const updated = structuredClone(blocks)
  const fields = { ...provenance.fields }
  for (const patch of patches) {
    const { set, path } = target(updated, patch)
    for (const key of Object.keys(patch.velocity)) {
      const exact = `${path}.${key}`
      // A newly reported measurement may coexist with estimated loads. Existing
      // estimated measurement leaves keep their origin even after confirmation.
      if (contextObject(set.velocity) && Object.hasOwn(set.velocity, key)
        && historyFieldProvenance(provenance, exact, 'quantities').origin === 'model_estimated'
        && patch.provenance[key].origin !== 'model_estimated') {
        throw new CoachingContextError(400, 'Existing estimated measurement must retain model_estimated origin')
      }
      fields[exact] = patch.provenance[key]
    }
    set.velocity = { ...(contextObject(set.velocity) ? set.velocity : {}), ...patch.velocity }
  }
  return { blocks: updated, provenance: { ...provenance, fields } }
}

const identity = (r: RepRecording) => `${r.source.file.sha256}:${r.set.id}`
function leaves(value: unknown, path: string, visit: (path: string) => void) {
  if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}[${i}]`, visit))
  else if (contextObject(value)) Object.entries(value).forEach(([k, v]) => leaves(v, `${path}.${k}`, visit))
  else visit(path)
}

/** One current source recording per set. Replacements are explicit and revision-audited;
 * exact original request retries recover the immutable receipt before reaching this helper. */
export function patchSetRecordings(blocks: unknown, patches: Record<string, any>[], provenance: CaptureProvenance) {
  const updated = structuredClone(blocks), fields = { ...provenance.fields }
  for (const patch of patches) {
    const { set, path } = target(updated, patch), recordingPath = `${path}.recording`
    const old = contextObject(set.velocity) ? set.velocity.recording : undefined
    if (old !== undefined) {
      if (!isRepRecording(old)) throw new CoachingContextError(409, 'Existing recording format requires explicit compatibility review')
      if (!patch.expectedRecording || patch.expectedRecording.fileSha256 !== old.source.file.sha256
        || patch.expectedRecording.sourceSetId !== old.set.id) throw new CoachingContextError(409, 'Read the existing recording identity before replacing it')
      if (canonicalActivityJson(old) === canonicalActivityJson(patch.recording)) throw new CoachingContextError(409, 'Source already attached; recover the original request instead of importing twice')
      if (Object.entries(provenance.fields).some(([p, source]) => source.origin === 'model_estimated'
        && (p === recordingPath || p.startsWith(`${recordingPath}.`) || p.startsWith(`${recordingPath}[`)))) {
        throw new CoachingContextError(400, 'Existing estimated recording leaves cannot be relabeled as imported source')
      }
      // Never turn an estimated descendant into an imported fact by replacing its parent.
      leaves(old, recordingPath, exact => {
        if (historyFieldProvenance(provenance, exact, 'quantities').origin === 'model_estimated') {
          throw new CoachingContextError(400, 'Existing estimated recording leaves cannot be relabeled as imported source')
        }
      })
    } else if (patch.expectedRecording !== null) throw new CoachingContextError(409, 'Expected recording is absent at this revision')
    const r = patch.recording as RepRecording
    if (typeof set.reps === 'number' && set.reps !== r.repetitions.length) throw new CoachingContextError(400, 'Source repetition count does not match the selected set')
    if (contextObject(set.load) && typeof set.load.value === 'number' && r.set.weight != null && r.set.weight_unit) {
      const kg = (value: number, unit: unknown) => unit === 'kg' ? value : unit === 'lb' || unit === 'lbs' ? value * 0.45359237 : null
      const existing = kg(set.load.value, set.load.unit), source = kg(r.set.weight, r.set.weight_unit)
      if (existing !== null && source !== null && Math.abs(existing - source) > 0.000001) throw new CoachingContextError(400, 'Source load does not match the selected set')
    }
    for (const key of Object.keys(fields)) if (key === recordingPath || key.startsWith(`${recordingPath}.`) || key.startsWith(`${recordingPath}[`)) delete fields[key]
    leaves(r, recordingPath, exact => { fields[exact] = patch.provenance })
    set.velocity = { ...(contextObject(set.velocity) ? set.velocity : {}), recording: structuredClone(r) }
  }
  const seen = new Set<string>()
  // Detect cross-path/cross-request duplicates in the resulting supported workout shape.
  for (const block of Array.isArray(updated) ? updated : []) for (const segment of Array.isArray(block?.segments) ? block.segments : [])
    for (const event of Array.isArray(segment?.events) ? segment.events : []) {
    for (const collection of ['sets', 'set_details']) if (Array.isArray(event?.performed?.[collection])) for (const set of event.performed[collection]) {
      const r = set?.velocity?.recording
      if (!isRepRecording(r)) continue
      if (seen.has(identity(r))) throw new CoachingContextError(409, 'Source recording already attached to another set in this workout')
      seen.add(identity(r))
    }
  }
  return { blocks: updated, provenance: { ...provenance, fields } }
}
