/**
 * Agentic loop — wraps the LLM seam with multi-turn tool use.
 *
 * When the model returns tool calls, the loop:
 * 1. Executes each tool call via the executor
 * 2. Appends the tool results (in the active provider's wire shape)
 * 3. Repeats until the model returns no tool calls, signals a final turn, or
 *    max rounds is reached.
 *
 * Provider-neutral: it drives complete() and delegates continuation-message
 * construction to the provider's appendToolResults, so the Anthropic
 * "tool_use + end_turn as a final action" quirk and OpenAI's function_call /
 * function_call_output shapes are both handled without special-casing here.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { complete, getProvider } from '@/app/lib/llm/client'
import type { LlmMessage, LlmToolDef } from '@/app/lib/llm/types'
import { executeToolCall, type ToolResult } from './executor'

const MAX_TOOL_ROUNDS = 3
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
  tools: LlmToolDef[]
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

  let messages: LlmMessage[] = [{ role: 'user', content: userInput }]
  const allToolCalls: ToolCallRecord[] = []
  const totalTokens = { input: 0, output: 0 }

  for (let round = 0; round < maxRounds; round++) {
    const result = await complete({
      purpose: 'agent',
      maxTokens: 4096,
      temperature: 0,
      system: systemPrompt,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      timeoutMs: TIMEOUT_MS
    })

    totalTokens.input += result.usage.input
    totalTokens.output += result.usage.output

    // No tool calls — the model answered directly.
    if (result.toolCalls.length === 0) {
      return { text: result.text, toolCalls: allToolCalls, totalTokens }
    }

    // Execute each tool call.
    const toolResults: Array<{ toolCallId: string; content: string }> = []
    for (const call of result.toolCalls) {
      const toolResult = await executeToolCall(
        call.name,
        call.input as Record<string, unknown>,
        userId,
        supabase
      )
      allToolCalls.push({
        name: call.name,
        input: call.input as Record<string, unknown>,
        result: toolResult
      })
      toolResults.push({ toolCallId: call.id, content: JSON.stringify(toolResult) })
    }

    // Some models return tool calls as their FINAL action (Anthropic sends
    // tool_use with stop_reason end_turn -> normalized to 'stop'). In that case
    // the tools are done above and we return the accompanying text now.
    if (result.stopReason !== 'tool_calls') {
      return { text: result.text, toolCalls: allToolCalls, totalTokens }
    }

    // Otherwise continue: append the tool-call turn + results and loop.
    // Use the provider that produced this result. The `agent` purpose can
    // override the global provider, so resolving the default provider here
    // can cross provider boundaries inside one tool loop.
    messages = getProvider(result.provider).appendToolResults(
      messages,
      result.toolCalls,
      toolResults
    )
  }

  // Exhausted max rounds — provide a sensible final message.
  const lastText = allToolCalls.length > 0
    ? 'Done — I completed the requested actions.'
    : 'I had trouble processing that. Could you try rephrasing?'

  return { text: lastText, toolCalls: allToolCalls, totalTokens }
}
