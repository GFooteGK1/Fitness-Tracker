import { CoachingContextError, contextObject } from './coaching-context'
import type { CaptureProvenance } from '../capture/contracts'
import { historyFieldProvenance } from './planning-history'

/** Paths identify existing source positions at the caller's expected workout revision.
 * No movement-name matching, array conversion, synthetic IDs or missing-set creation. */
export function patchSetMeasurements(blocks: unknown, patches: Record<string, any>[], provenance: CaptureProvenance) {
  const updated = structuredClone(blocks)
  const fields = { ...provenance.fields }
  for (const patch of patches) {
    const { blockIndex: bi, segmentIndex: si, eventIndex: ei, collection, setIndex: index } = patch
    const block = Array.isArray(updated) ? updated[bi] : undefined
    const segment = contextObject(block) && Array.isArray(block.segments) ? block.segments[si] : undefined
    const event = contextObject(segment) && Array.isArray(segment.events) ? segment.events[ei] : undefined
    const sets = contextObject(event) && contextObject(event.performed) ? event.performed[collection] : undefined
    const set = Array.isArray(sets) ? sets[index] : undefined
    if (!contextObject(set) || Object.hasOwn(set, 'velocity') && set.velocity !== null && !contextObject(set.velocity)) {
      throw new CoachingContextError(400, 'Measurement path must select an existing performed set with object/null/absent velocity')
    }
    const path = `blocks[${bi}].segments[${si}].events[${ei}].performed.${collection}[${index}].velocity`
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
