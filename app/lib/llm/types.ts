/**
 * Provider-neutral LLM contract (see ADR-0001 and the OpenAI migration plan).
 *
 * Call sites depend only on these types via the seam (`app/lib/llm`), so the
 * underlying SDK can be swapped — per purpose — without touching routes/agents.
 * Providers (anthropic, openai) implement `LlmProvider`.
 */

export type LlmProviderName = 'anthropic' | 'openai'

/**
 * Task-shaped purposes drive per-purpose model selection (see getModel) and
 * map to the surface taxonomy in ADR-0001. Kept identical to the legacy
 * `AnthropicModelPurpose` set so migration is a rename, not a re-think.
 */
export type ModelPurpose =
  | 'default'
  | 'nutrition'
  | 'vision'
  | 'workout'
  | 'query'
  | 'agent'
  | 'fast'

export interface TextPart {
  type: 'text'
  text: string
}

export interface ImagePart {
  type: 'image'
  /** e.g. 'image/jpeg' — providers map this into their own wire format. */
  mediaType: string
  /** Raw base64 (no `data:` prefix). */
  base64: string
}

export type ContentPart = TextPart | ImagePart

export interface LlmToolCall {
  id: string
  name: string
  input: unknown
}

export interface LlmMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string | ContentPart[]
  /** Set on assistant turns that issued tool calls (for loop continuation). */
  toolCalls?: LlmToolCall[]
  /** Set on `role: 'tool'` messages — the tool call this result answers. */
  toolCallId?: string
}

export interface LlmToolDef {
  name: string
  description?: string
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>
}

export type LlmStopReason = 'stop' | 'tool_calls' | 'max_tokens' | 'refusal'

export interface LlmUsage {
  input: number
  output: number
}

export interface LlmRequest {
  purpose: ModelPurpose
  system?: string
  messages: LlmMessage[]
  tools?: LlmToolDef[]
  maxTokens: number
  /** Extraction should pin this to 0; defaults to the provider default otherwise. */
  temperature?: number
  /**
   * 'json' requests structured output — OpenAI uses strict json_schema,
   * Anthropic enforces via prompt. Defaults to 'text'.
   */
  responseFormat?: 'text' | 'json'
  /** Schema for responseFormat 'json' on providers that support strict mode. */
  jsonSchema?: { name: string; schema: Record<string, unknown> }
  timeoutMs?: number
  /**
   * Reasoning effort for reasoning-capable models (GPT-5.x); ignored where
   * unsupported. Per the cost strategy, extraction purposes use 'low'.
   */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
}

export interface LlmResult {
  text: string
  toolCalls: LlmToolCall[]
  usage: LlmUsage
  stopReason: LlmStopReason
  model: string
  provider: LlmProviderName
}

export interface LlmProvider {
  readonly name: LlmProviderName
  /** Single model call; normalizes the provider response into LlmResult. */
  chat(req: LlmRequest, model: string): Promise<LlmResult>
  /**
   * Append an assistant tool-call turn plus its results to a message list in
   * this provider's wire shape (Anthropic: assistant content blocks + user
   * tool_result; OpenAI: assistant tool_calls + role:'tool'). Used by the
   * agent loop so provider-specific continuation stays inside the provider.
   */
  appendToolResults(
    messages: LlmMessage[],
    calls: LlmToolCall[],
    results: Array<{ toolCallId: string; content: string }>
  ): LlmMessage[]
}
