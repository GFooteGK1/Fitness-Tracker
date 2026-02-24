import { SupabaseClient } from '@supabase/supabase-js'
import { ChatMessage, ChatCompactionSummary } from './types'

/**
 * Extract key facts from messages that should be preserved during compaction.
 * Preserves entity references (workouts, meals), PR mentions, and corrections.
 */
export function extractKeyFacts(messages: ChatMessage[]): string[] {
  const facts: string[] = []

  for (const msg of messages) {
    if (msg.related_entity_type === 'workout') {
      facts.push(`Logged workout: ${msg.related_entity_id}`)
    }
    if (msg.related_entity_type === 'meal') {
      facts.push(`Logged meal: ${msg.related_entity_id}`)
    }
    const lower = msg.content.toLowerCase()
    if (lower.includes('pr') || lower.includes('personal record')) {
      facts.push(`PR mentioned: ${msg.content.substring(0, 100)}`)
    }
    if (lower.includes('correction') || lower.includes('actually') || lower.includes('wrong')) {
      facts.push(`Correction: ${msg.content.substring(0, 100)}`)
    }
  }

  return facts
}

/**
 * Generate a text summary from compacted messages and their key facts.
 * No LLM call — concatenates key facts with a message count summary.
 */
export function generateCompactionSummary(
  messages: ChatMessage[],
  keyFacts: string[]
): ChatCompactionSummary {
  const roles = messages.reduce<Record<string, number>>((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1
    return acc
  }, {})

  const roleBreakdown = Object.entries(roles)
    .map(([role, count]) => `${role}: ${count}`)
    .join(', ')

  const summaryParts: string[] = [
    `[Compacted ${messages.length} messages (${roleBreakdown})]`,
  ]

  if (keyFacts.length > 0) {
    summaryParts.push('Key facts:')
    summaryParts.push(...keyFacts.map(f => `- ${f}`))
  }

  return {
    original_message_count: messages.length,
    summary: summaryParts.join('\n'),
    key_facts: keyFacts,
    compacted_at: new Date().toISOString(),
  }
}

/**
 * Compact old messages into summaries when non-compacted count exceeds threshold.
 * Summarizes the oldest messages, inserts a system summary message,
 * and marks originals as compacted.
 */
export async function compactOldMessages(
  supabase: SupabaseClient,
  userId: string,
  threshold: number = 100
): Promise<void> {
  // Count non-compacted messages
  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_compacted', false)

  if (!count || count <= threshold) return

  // Fetch the oldest messages that exceed the threshold
  const messagesToCompact = count - threshold
  const { data: oldMessages } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('is_compacted', false)
    .order('created_at', { ascending: true })
    .limit(messagesToCompact)

  if (!oldMessages || oldMessages.length === 0) return

  const keyFacts = extractKeyFacts(oldMessages as ChatMessage[])
  const compactionResult = generateCompactionSummary(oldMessages as ChatMessage[], keyFacts)

  // Insert compacted summary as a system message
  await supabase.from('chat_messages').insert({
    user_id: userId,
    role: 'system',
    content: compactionResult.summary,
    is_compacted: true,
  })

  // Mark original messages as compacted
  const oldIds = oldMessages.map((m: { id: string }) => m.id)
  await supabase
    .from('chat_messages')
    .update({ is_compacted: true })
    .in('id', oldIds)
}
