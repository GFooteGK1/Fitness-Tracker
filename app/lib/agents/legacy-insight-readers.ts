import type { SupabaseClient } from '@supabase/supabase-js'
import { canSurfaceLegacyInsight } from './legacy-insight-guard'

/** Preserve ordinary conversations and user text. Re-surface a typed insight message
 * only after its owned source is resolved and passes the permanent contract guard.
 * Historical storage is never edited by this read.
 */
export async function filterRetiredInsightMessages<T extends { role?: string; related_entity_type?: string | null; related_entity_id?: string | null }>(
  supabase: SupabaseClient, userId: string, messages: T[]
): Promise<T[]> {
  const isInsight = (message:T) => message.role !== 'user' && message.related_entity_type === 'insight'
  const ids = [...new Set(messages.filter(isInsight).flatMap(message => message.related_entity_id ? [message.related_entity_id] : []))]
  if (!messages.some(isInsight)) return messages
  if (!ids.length || ids.length > 100) return messages.filter(message => !isInsight(message))
  const {data,error} = await supabase.from('insights').select('id,pattern_id').eq('user_id',userId).in('id',ids).limit(ids.length)
  const allowed = new Set(error ? [] : (data ?? []).filter(row => typeof row.pattern_id === 'string' && canSurfaceLegacyInsight(row)).map(row => row.id))
  return messages.filter(message => !isInsight(message) || allowed.has(message.related_entity_id))
}
