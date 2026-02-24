import { SupabaseClient } from '@supabase/supabase-js'
import { AgentRequest, AgentMessage, ClassificationResult, ChatMessage } from './types'

/** Persist user message + agent responses to chat_messages table */
export async function persistMessages(
  supabase: SupabaseClient,
  userId: string,
  userInput: AgentRequest,
  agentMessages: AgentMessage[],
  classification: ClassificationResult
): Promise<void> {
  const rows = [
    // User message — stores both input_mode and input_type
    {
      user_id: userId,
      role: 'user' as const,
      content: userInput.content,
      input_mode: userInput.input_mode,
      input_type: classification.input_type,
      domain: null,
      confidence: classification.confidence,
      related_entity_id: null,
      related_entity_type: null,
      is_compacted: false
    },
    // Agent messages
    ...agentMessages.map(msg => ({
      user_id: userId,
      role: msg.role,
      content: msg.content,
      input_mode: null,
      input_type: null,
      domain: msg.domain ?? null,
      confidence: msg.confidence ?? null,
      related_entity_id: msg.related_entity_id ?? null,
      related_entity_type: msg.related_entity_type ?? null,
      is_compacted: false
    }))
  ]

  const { error } = await supabase.from('chat_messages').insert(rows)
  if (error) {
    console.error('Failed to persist chat messages:', error)
  }
}

/** Fetch recent chat for context (only non-compacted messages, chronological order) */
export async function fetchRecentChat(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 20
): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('is_compacted', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || []).reverse()
}

/** Fetch urgent insights that haven't been surfaced yet */
export async function fetchPendingUrgentInsights(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; content: string }[]> {
  const { data } = await supabase
    .from('insights')
    .select('id, content')
    .eq('user_id', userId)
    .eq('priority', 'urgent')
    .is('surfaced_at', null)
    .order('created_at', { ascending: false })

  return data || []
}
