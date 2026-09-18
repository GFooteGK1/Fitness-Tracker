/** These owned RPC errors occur only after exact-event replay and before a new write.
 * Unknown transport, serialization and payload-conflict errors retain the original retry.
 */
export function confirmedUnwrittenEvent(error: { code?: string; message?: string }, kind: 'response' | 'shown' | 'coverage'): boolean {
  if (kind === 'coverage') {
    return (error.code === '40001' && error.message === 'Coverage sources changed')
      || (error.code === '22023' && error.message === 'Invalid bounded coverage confirmation')
  }
  return (error.code === '40001' && ['Recommendation is no longer current', 'Recommendation local scope changed'].includes(error.message ?? ''))
    || (kind === 'response' && error.code === '22023' && error.message === 'Invalid defer time')
}
