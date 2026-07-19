/**
 * Anthropic provider for the LLM seam.
 *
 * Wraps @anthropic-ai/sdk behind the neutral LlmProvider contract, mapping
 * neutral requests/messages onto the Messages API and normalizing the response
 * back into an LlmResult. This is a faithful port of how the app already calls
 * Anthropic; behavior should be unchanged when the active provider is anthropic.
 */
import Anthropic from '@anthropic-ai/sdk'
import type {
  MessageParam,
  Tool,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages'
import type {
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmMessage,
  LlmToolCall,
  LlmStopReason,
  ContentPart,
} from '../types'

// Derive the content-block param union from the SDK's MessageParam so we don't
// depend on the exact exported type name (it varies across SDK versions).
type ContentBlockParam = Exclude<MessageParam['content'], string>[number]

type AnthropicMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

let client: Anthropic | null = null

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }
  if (!client) {
    client = new Anthropic({ apiKey })
  }
  return client
}

function toAnthropicContent(content: string | ContentPart[]): string | ContentBlockParam[] {
  if (typeof content === 'string') return content
  return content.map((part): ContentBlockParam => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text }
    }
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: part.mediaType as AnthropicMediaType,
        data: part.base64,
      },
    }
  })
}

/**
 * Map neutral messages onto Anthropic's wire shape. A run of `tool` messages
 * collapses into one user message of tool_result blocks; an assistant turn
 * carrying toolCalls becomes an assistant message with tool_use blocks.
 */
function toAnthropicMessages(messages: LlmMessage[]): MessageParam[] {
  const out: MessageParam[] = []
  let pendingToolResults: ContentBlockParam[] = []

  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      out.push({ role: 'user', content: pendingToolResults })
      pendingToolResults = []
    }
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      pendingToolResults.push({
        type: 'tool_result',
        tool_use_id: message.toolCallId ?? '',
        content: typeof message.content === 'string' ? message.content : '',
      })
      continue
    }

    flushToolResults()

    if (message.role === 'assistant') {
      const blocks: ContentBlockParam[] = []
      const mapped = toAnthropicContent(message.content)
      if (typeof mapped === 'string') {
        if (mapped) blocks.push({ type: 'text', text: mapped })
      } else {
        blocks.push(...mapped)
      }
      for (const call of message.toolCalls ?? []) {
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input })
      }
      out.push({ role: 'assistant', content: blocks.length > 0 ? blocks : '' })
    } else {
      out.push({ role: 'user', content: toAnthropicContent(message.content) })
    }
  }

  flushToolResults()
  return out
}

function mapStopReason(reason: string | null): LlmStopReason {
  switch (reason) {
    case 'tool_use':
      return 'tool_calls'
    case 'max_tokens':
      return 'max_tokens'
    default:
      return 'stop'
  }
}

export const anthropicProvider: LlmProvider = {
  name: 'anthropic',

  async chat(req: LlmRequest, model: string): Promise<LlmResult> {
    const params: MessageCreateParamsNonStreaming = {
      model,
      max_tokens: req.maxTokens,
      messages: toAnthropicMessages(req.messages),
      ...(req.system ? { system: req.system } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.tools && req.tools.length > 0
        ? {
            tools: req.tools.map(
              (t): Tool => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters as Tool['input_schema'],
              })
            ),
          }
        : {}),
    }

    const response = await getClient().messages.create(
      params,
      req.timeoutMs ? { signal: AbortSignal.timeout(req.timeoutMs) } : undefined
    )

    let text = ''
    const toolCalls: LlmToolCall[] = []
    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text
      } else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, input: block.input })
      }
    }

    return {
      text,
      toolCalls,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      stopReason: mapStopReason(response.stop_reason),
      model,
      provider: 'anthropic',
    }
  },

  appendToolResults(messages, calls, results) {
    return [
      ...messages,
      { role: 'assistant', content: '', toolCalls: calls },
      ...results.map((r) => ({
        role: 'tool' as const,
        toolCallId: r.toolCallId,
        content: r.content,
      })),
    ]
  },
}
