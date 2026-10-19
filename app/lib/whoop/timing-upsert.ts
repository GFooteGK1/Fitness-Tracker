import type { SupabaseClient } from '@supabase/supabase-js'
import { isWhoopTimingOwner } from './timing-owner'
import { projectProviderTiming, type TimingKind } from './provider-timing'

const targets = {
  recovery: { table: 'whoop_recovery', conflict: 'user_id,cycle_id' },
  sleep: { table: 'whoop_sleep', conflict: 'user_id,sleep_id' },
  cycle: { table: 'whoop_cycles', conflict: 'user_id,cycle_id' },
} as const

/** Keep legacy-only rows separate: bulk column unions would otherwise send
 * absent timing as null for malformed rows and erase their retained evidence.
 * The fixed owner filter changes no auth, account state, job or provider request.
 */
export async function upsertWhoopTiming<T extends object>(db: SupabaseClient, kind: TimingKind,
  userId: string, records: T[], payloads: unknown[]): Promise<{ error: unknown }> {
  const target = targets[kind]
  if (!records.length) return { error: null }
  if (!isWhoopTimingOwner(userId)) return await db.from(target.table).upsert(records, { onConflict: target.conflict })
  if (records.length !== payloads.length || records.some(row => (row as Record<string, unknown>).user_id !== userId)) {
    throw new Error('WHOOP timing source identity mismatch')
  }
  // Preserve legacy bulk failure/atomicity for duplicate conflict targets. Do
  // not let partitioning turn one rejected bulk write into two successful ones.
  const idField = kind === 'sleep' ? 'sleep_id' : 'cycle_id'
  const identities = records.map(row => String((row as Record<string, unknown>)[idField]))
  if (new Set(identities).size !== records.length) {
    return await db.from(target.table).upsert(records, { onConflict: target.conflict })
  }
  const ingestedAt = new Date().toISOString()
  const legacy: object[] = [], timed: object[] = []
  records.forEach((row, i) => {
    const timing = projectProviderTiming(kind, payloads[i], row, ingestedAt)
    if (timing) timed.push({ ...row, ...timing })
    else legacy.push(row)
  })
  // At most two owner-only calls, no new reads and no cross-domain transaction.
  for (const group of [legacy, timed]) {
    if (!group.length) continue
    const result = await db.from(target.table).upsert(group, { onConflict: target.conflict })
    if (result.error) return { error: result.error }
  }
  return { error: null }
}
