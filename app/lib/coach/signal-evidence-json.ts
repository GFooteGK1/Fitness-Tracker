/** Shared structural bound for factual signal envelopes and saved readback. */
export function signalEvidenceJson(value: unknown, depth = 0): boolean {
  if (depth > 12) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length <= 160 && value.every(item => signalEvidenceJson(item, depth + 1))
  return !!value && typeof value === 'object' && Object.keys(value).length <= 100
    && Object.values(value).every(item => signalEvidenceJson(item, depth + 1))
}
