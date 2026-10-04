/** Fixed-run local control; never an application or database mutation. */
export interface LocalFinalization {
  operation: 'finalize'
  runId: string
  programId: string
  requestId: string
}
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
export function localFinalization(value: unknown, runId: string, programId: string): LocalFinalization | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join(',') !== 'operation,programId,requestId,runId'
    || record.operation !== 'finalize' || record.runId !== runId || record.programId !== programId
    || !uuid(record.requestId) || !uuid(runId) || !uuid(programId)) return null
  return record as unknown as LocalFinalization
}

/** Socket closure can precede completion of a disconnected client's request. */
export class LocalRequestDrain {
  private active = 0
  private closing = false
  private waiters: Array<() => void> = []
  admit(): (() => void) | null {
    if (this.closing) return null
    this.active++
    let released = false
    return () => {
      if (released) return
      released = true; this.active--
      if (!this.active) this.waiters.splice(0).forEach(resolve => resolve())
    }
  }
  begin(): Promise<void> {
    this.closing = true
    return this.active ? new Promise(resolve => this.waiters.push(resolve)) : Promise.resolve()
  }
}
