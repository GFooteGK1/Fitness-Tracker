/** Matches the existing WHOOP data endpoint's 24-hour freshness window.
 * This is source eligibility, not a recovery or training threshold.
 */
export function isWhoopSyncEligible(connected: boolean, sync: { status?: unknown; last_sync_at?: unknown; error_message?: unknown } | null, asOf: number): boolean {
  const syncedAt = typeof sync?.last_sync_at === 'string' ? Date.parse(sync.last_sync_at) : NaN
  return connected && sync?.status === 'idle' && !sync.error_message && Number.isFinite(syncedAt)
    && syncedAt <= asOf && asOf - syncedAt <= 24 * 60 * 60_000
}
