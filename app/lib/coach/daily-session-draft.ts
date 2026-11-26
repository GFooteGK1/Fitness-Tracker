import type { SupabaseClient } from '@supabase/supabase-js'
import { contextObject } from './coaching-context'
import { stableStringify } from './rolling-weekly-contracts'

const table = 'coach_daily_checkins'
const columns = 'user_id,local_date,check_in_revision,session_draft'

type DailySessionDraftRead =
  | { status: 'saved'; revision: string; draft: unknown }
  | { status: 'missing' }
  | { status: 'unavailable' }

export async function readDailySessionDraft(db: SupabaseClient, owner: string, date: string, revision?: string): Promise<DailySessionDraftRead> {
  try {
    const byDate = db.from(table).select(columns)
      .eq('user_id', owner).eq('local_date', date)
    const { data, error } = await (revision === undefined ? byDate : byDate.eq('check_in_revision', revision)).limit(2)
    if (error || !Array.isArray(data) || data.length > 1) return { status: 'unavailable' }
    if (!data.length) return { status: 'missing' }
    const row = data[0]
    if (!contextObject(row) || row.user_id !== owner || row.local_date !== date) return { status: 'unavailable' }
    if (row.session_draft == null) return { status: 'missing' }
    if (!contextObject(row.session_draft) || row.session_draft.date !== date || typeof row.check_in_revision !== 'string'
      || !row.check_in_revision || (revision !== undefined && row.check_in_revision !== revision)) return { status: 'unavailable' }
    return { status: 'saved', revision: row.check_in_revision, draft: row.session_draft }
  } catch {
    return { status: 'unavailable' }
  }
}

/** Update only the check-in revision used when validating this draft. */
export async function saveDailySessionDraft(db: SupabaseClient, owner: string, date: string, revision: string, draft: unknown): Promise<'saved' | 'stale' | 'unavailable'> {
  if (!contextObject(draft) || draft.date !== date) return 'unavailable'
  try {
    const { data, error } = await db.from(table).update({ session_draft: draft })
      .eq('user_id', owner).eq('local_date', date).eq('check_in_revision', revision)
      .select(columns)
    if (error || !Array.isArray(data) || data.length > 1) return 'unavailable'
    if (!data.length) return 'stale'
    const row = data[0]
    return contextObject(row) && row.user_id === owner && row.local_date === date && row.check_in_revision === revision
      && stableStringify(row.session_draft) === stableStringify(draft)
      ? 'saved' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}
