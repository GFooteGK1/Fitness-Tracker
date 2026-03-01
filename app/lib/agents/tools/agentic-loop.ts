/**
 * Agentic loop — wraps anthropic.messages.create() with multi-turn tool_use.
 *
 * When Claude returns tool_use blocks, the loop:
 * 1. Executes each tool call via the executor
 * 2. Sends tool results back to Claude
 * 3. Repeats until Claude returns end_turn or max rounds is reached
 */
import Anthropic from '@anthropic-ai/sdk'
import type { Tool, MessageParam, ContentBlock } from '@anthropic-ai/sdk/resources/messages'
import type { SupabaseClient } from '@supabase/supabase-js'
import { executeToolCall, type ToolResult } from './executor'

const MAX_TOOL_ROUNDS = 3
const MODEL = 'claude-sonnet-4-20250514'
const TIMEOUT_MS = 30_000

// ─── Types ─────────────────────────────────────────────────────────────

export interface ToolCallRecord {
  name: string
  input: Record<string, unknown>
  result: ToolResult
}

export interface AgenticCallResult {
  /** The final text response from the agent */
  text: string
  /** All tool calls that were executed during this turn */
  toolCalls: ToolCallRecord[]
  /** Total token usage across all rounds */
  totalTokens: { input: number; output: number }
}

export interface AgenticCallOptions {
  systemPrompt: string
  userInput: string
  tools: Tool[]
  userId: string
  supabase: SupabaseClient
  maxRounds?: number
}

// ─── Main Loop ─────────────────────────────────────────────────────────

export async function callAgentWithTools(
  options: AgenticCallOptions
): Promise<AgenticCallResult> {
  const {
    systemPrompt,
    userInput,
    tools,
    userId,
    supabase,
    maxRounds = MAX_TOOL_ROUNDS
  } = options

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const messages: MessageParam[] = [{ role: 'user', content: userInput }]
  const allToolCalls: ToolCallRecord[] = []
  const totalTokens = { input: 0, output: 0 }

  for (let round = 0; round < maxRounds; round++) {
    const message = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 4096,
        temperature: 0,
        system: systemPrompt,
        messages,
        ...(tools.length > 0 ? { tools } : {})
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    )

    totalTokens.input += message.usage.input_tokens
    totalTokens.output += message.usage.output_tokens

    // Extract tool_use blocks from response
    const toolUseBlocks = message.content.filter(
      (block: ContentBlock) => block.type === 'tool_use'
    )

    // If no tool calls, extract text and return
    if (toolUseBlocks.length === 0) {
      const textBlock = message.content.find(
        (block: ContentBlock) => block.type === 'text'
      )
      const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
      return { text, toolCalls: allToolCalls, totalTokens }
    }

    // Execute tool calls (even if stop_reason is 'end_turn' — Claude commonly
    // sends tool_use + end_turn together when a single tool call is its final action)
    const toolResults: Array<{
      type: 'tool_result'
      tool_use_id: string
      content: string
    }> = []

    for (const block of toolUseBlocks) {
      if (block.type !== 'tool_use') continue

      const result = await executeToolCall(
        block.name,
        block.input as Record<string, unknown>,
        userId,
        supabase
      )

      allToolCalls.push({
        name: block.name,
        input: block.input as Record<string, unknown>,
        result
      })

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result)
      })
    }

    // If stop_reason is end_turn, return after executing tools — no further rounds needed.
    // Extract the text block from this same response for the agent's final message.
    if (message.stop_reason === 'end_turn') {
      const textBlock = message.content.find(
        (block: ContentBlock) => block.type === 'text'
      )
      const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''
      return { text, toolCalls: allToolCalls, totalTokens }
    }

    // Append assistant message (with tool_use blocks) and tool results to continue
    messages.push({ role: 'assistant', content: message.content })
    messages.push({ role: 'user', content: toolResults })
  }

  // Exhausted max rounds — extract any text from the last response or provide fallback
  const lastText = allToolCalls.length > 0
    ? 'Done — I completed the requested actions.'
    : 'I had trouble processing that. Could you try rephrasing?'

  return { text: lastText, toolCalls: allToolCalls, totalTokens }
}
