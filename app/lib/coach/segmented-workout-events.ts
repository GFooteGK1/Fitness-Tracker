/** Read stored event locations without flattening rounds, scores or targets into actual work. */
type Row = Record<string, unknown>
const record = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
export function readSegmentedWorkoutEvents(block: Row, path: string) {
  const entries: Array<{ entry: Row; path: string; segmentPath: string; rounds: unknown }> = []
  const issues: string[] = []
  if (!Array.isArray(block.segments) || !block.segments.length) return { entries, issues: ['unsupported_segments'] }
  block.segments.forEach((segment, si) => {
    const segmentPath = `${path}.segments[${si}]`
    if (!record(segment) || !Array.isArray(segment.events) || !segment.events.length) {
      issues.push(`unsupported_segment_events:${si}`); return
    }
    segment.events.forEach((entry, ei) => {
      if (!record(entry) || typeof entry.movement_name !== 'string' || !entry.movement_name.trim()
        || !record(entry.performed) || !Object.keys(entry.performed).length
        || entry.completed === false || entry.workStatus === 'unsure'
        || entry.performed.completed === false || entry.performed.workStatus === 'unsure') {
        issues.push(`unsupported_performed_event:${si}:${ei}`); return
      }
      entries.push({ entry, path: `${segmentPath}.events[${ei}]`, segmentPath, rounds: segment.rounds })
    })
  })
  return { entries, issues }
}
