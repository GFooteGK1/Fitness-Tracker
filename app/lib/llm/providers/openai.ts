/**
 * OpenAI provider for the LLM seam (Responses API).
 *
 * Implements the neutral LlmProvider contract over `openai` v6's Responses API:
 * neutral messages map to Response input items (system -> instructions, images
 * -> input_image data URLs, tool results -> function_call_output), and the
 * response normalizes back into an LlmResult (output_text, function_call items,
 * usage, stop reason incl. refusal/length). Structured output uses strict
 * json_schema; reasoning effort is passed through for GPT-5.x.
 *
 * NOTE: GPT-5.6 does not downscale images (detail 'auto' = original), so call
 * sites must keep compressing images before the vision call (see ADR / plan).
 */
import OpenAI from 'openai'
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseInputItem,
  ResponseInputContent,
  Tool,
} from 'openai/resources/responses/responses'
import type {
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmMessage,
  LlmToolCall,
  LlmStopReason,
  ContentPart,
} from '../types'

let client: OpenAI | null = null

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  if (!client) {
    client = new OpenAI({ apiKey })
  }
  return client
}

function toInputContent(content: string | ContentPart[]): string | ResponseInputContent[] {
  if (typeof content === 'string') return content
  return content.map((part): ResponseInputContent => {
    if (part.type === 'text') {
      return { type: 'input_text', text: part.text }
    }
    return {
      type: 'input_image',
      image_url: `data:${part.mediaType};base64,${part.base64}`,
      detail: 'auto',
    }
  })
}

/**
 * Map neutral messages onto the Responses `input` array. Assistant tool-call
 * turns become `function_call` items; `tool` messages become
 * `function_call_output` items; everything else is a role message.
 */
function toResponseInput(messages: LlmMessage[]): ResponseInputItem[] {
  const items: ResponseInputItem[] = []

  for (const message of messages) {
    if (message.role === 'tool') {
      items.push({
        type: 'function_call_output',
        call_id: message.toolCallId ?? '',
        output: typeof message.content === 'string' ? message.content : '',
      })
      continue
    }

    if (message.role === 'assistant') {
      const text = typeof message.content === 'string' ? message.content : ''
      if (text) {
        items.push({ role: 'assistant', content: text })
      }
      for (const call of message.toolCalls ?? []) {
        items.push({
          type: 'function_call',
          call_id: call.id,
          name: call.name,
          arguments: JSON.stringify(call.input ?? {}),
        })
      }
      continue
    }

    items.push({ role: 'user', content: toInputContent(message.content) })
  }

  return items
}

function extractToolCalls(response: Response): LlmToolCall[] {
  const calls: LlmToolCall[] = []
  for (const item of response.output) {
    if (item.type === 'function_call') {
      let input: unknown = {}
      try {
        input = item.arguments ? JSON.parse(item.arguments) : {}
      } catch {
        input = { _raw: item.arguments }
      }
      calls.push({ id: item.call_id, name: item.name, input })
    }
  }
  return calls
}

function hasRefusal(response: Response): boolean {
  for (const item of response.output) {
    if (item.type === 'message') {
      for (const part of item.content) {
        if (part.type === 'refusal') return true
      }
    }
  }
  return false
}

function mapStopReason(response: Response, toolCalls: LlmToolCall[]): LlmStopReason {
  if (toolCalls.length > 0) return 'tool_calls'
  if (
    response.status === 'incomplete' &&
    response.incomplete_details?.reason === 'max_output_tokens'
  ) {
    return 'max_tokens'
  }
  if (!response.output_text && hasRefusal(response)) return 'refusal'
  return 'stop'
}

export const openaiProvider: LlmProvider = {
  name: 'openai',

  async chat(req: LlmRequest, model: string): Promise<LlmResult> {
    const params: ResponseCreateParamsNonStreaming = {
      model,
      input: toResponseInput(req.messages),
      max_output_tokens: req.maxTokens,
      ...(req.system ? { instructions: req.system } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.reasoningEffort ? { reasoning: { effort: req.reasoningEffort } } : {}),
      ...(req.tools && req.tools.length > 0
        ? {
            tools: req.tools.map(
              (t): Tool => ({
                type: 'function',
                name: t.name,
                description: t.description ?? null,
                parameters: t.parameters,
                strict: false,
              })
            ),
          }
        : {}),
      ...(req.responseFormat === 'json' && req.jsonSchema
        ? {
            text: {
              format: {
                type: 'json_schema',
                name: req.jsonSchema.name,
                schema: req.jsonSchema.schema,
                strict: true,
              },
            },
          }
        : {}),
    }

    const response = await getClient().responses.create(
      params,
      req.timeoutMs ? { signal: AbortSignal.timeout(req.timeoutMs) } : undefined
    )

    const toolCalls = extractToolCalls(response)

    return {
      text: response.output_text ?? '',
      toolCalls,
      usage: {
        input: response.usage?.input_tokens ?? 0,
        output: response.usage?.output_tokens ?? 0,
      },
      stopReason: mapStopReason(response, toolCalls),
      model,
      provider: 'openai',
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
