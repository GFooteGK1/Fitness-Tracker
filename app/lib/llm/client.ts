/**
 * Model + provider selection for the LLM seam.
 *
 * Ports the semantics of the legacy `getAnthropicModel` (per-purpose env
 * overrides + retired-model blocklist + sensible defaults) and generalizes
 * them across providers. The OpenAI per-purpose defaults follow ADR-0001 and
 * the per-task cost strategy: nano for text plumbing, luna for vision and
 * user-facing prose, terra for the agent loop. Several are eval-gated before
 * final lock (Phase 4) and can be overridden per purpose via env without code.
 */
import type { LlmProvider, LlmProviderName, LlmRequest, LlmResult, ModelPurpose } from './types'
import { anthropicProvider } from './providers/anthropic'
import { openaiProvider } from './providers/openai'

/** Known-bad model IDs that must never be used even if set in env. */
const RETIRED_OR_STALE_MODEL_IDS = new Set([
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
  'claude-3-5-sonnet-20241022',
  'claude-opus-4-5',
])

const DEFAULT_MODELS: Record<LlmProviderName, Record<ModelPurpose, string>> = {
  anthropic: {
    default: 'claude-sonnet-4-6',
    nutrition: 'claude-sonnet-4-6',
    vision: 'claude-sonnet-4-6',
    workout: 'claude-sonnet-4-6',
    query: 'claude-sonnet-4-6',
    agent: 'claude-sonnet-4-6',
    fast: 'claude-haiku-4-5-20251001',
  },
  openai: {
    default: 'gpt-5.4-nano',
    nutrition: 'gpt-5.4-nano', // eval-gated vs luna (Phase 4)
    vision: 'gpt-5.6-luna', // eval-gated vs terra (Phase 4)
    workout: 'gpt-5.4-nano', // eval-gated vs luna (Phase 4)
    query: 'gpt-5.6-luna',
    agent: 'gpt-5.6-terra', // eval-gated vs luna (Phase 4)
    fast: 'gpt-5.4-nano',
  },
}

/** Legacy Anthropic per-purpose env names, preserved for backward compat. */
const LEGACY_ANTHROPIC_ENV: Record<ModelPurpose, string | undefined> = {
  default: 'ANTHROPIC_MODEL',
  nutrition: 'ANTHROPIC_NUTRITION_MODEL',
  vision: 'ANTHROPIC_VISION_MODEL',
  workout: 'ANTHROPIC_WORKOUT_MODEL',
  query: 'ANTHROPIC_QUERY_MODEL',
  agent: 'ANTHROPIC_AGENT_MODEL',
  fast: 'ANTHROPIC_FAST_MODEL',
}

export function getActiveProviderName(): LlmProviderName {
  return process.env.LLM_PROVIDER?.trim().toLowerCase() === 'openai'
    ? 'openai'
    : 'anthropic'
}

/**
 * Resolve the provider for a specific purpose. A per-purpose override —
 * `LLM_<PURPOSE>_PROVIDER` (e.g. `LLM_VISION_PROVIDER=anthropic`) — beats the
 * global `LLM_PROVIDER`. This is what enables an incremental migration: flip
 * cheap/low-risk purposes (classification, extraction) to OpenAI while keeping
 * an accuracy-critical purpose (e.g. vision) on Anthropic, all via env.
 */
export function getProviderForPurpose(purpose: ModelPurpose = 'default'): LlmProviderName {
  const perPurpose = process.env[`LLM_${purpose.toUpperCase()}_PROVIDER`]?.trim().toLowerCase()
  if (perPurpose === 'openai') return 'openai'
  if (perPurpose === 'anthropic') return 'anthropic'
  return getActiveProviderName()
}

function cleanModel(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || RETIRED_OR_STALE_MODEL_IDS.has(trimmed)) return null
  return trimmed
}

function getLegacyAnthropicModel(purpose: ModelPurpose): string | null {
  if (purpose === 'fast') {
    return (
      cleanModel(process.env.ANTHROPIC_FAST_MODEL) ??
      cleanModel(process.env.ANTHROPIC_MODEL)
    )
  }
  const name = LEGACY_ANTHROPIC_ENV[purpose]
  return (
    cleanModel(name ? process.env[name] : undefined) ??
    cleanModel(process.env.ANTHROPIC_MODEL)
  )
}

/**
 * Resolve the model ID for a purpose. Override precedence:
 *   1. LLM_<PROVIDER>_<PURPOSE>_MODEL  (e.g. LLM_OPENAI_VISION_MODEL)
 *   2. LLM_<PROVIDER>_MODEL            (provider-wide override)
 *   3. legacy ANTHROPIC_* envs         (anthropic only)
 *   4. built-in per-provider default
 * The retired-model blocklist is applied to every env-sourced value.
 */
export function getModel(
  purpose: ModelPurpose = 'default',
  provider: LlmProviderName = getProviderForPurpose(purpose)
): string {
  const p = provider.toUpperCase()
  const u = purpose.toUpperCase()

  const perPurpose = cleanModel(process.env[`LLM_${p}_${u}_MODEL`])
  if (perPurpose) return perPurpose

  const providerWide = cleanModel(process.env[`LLM_${p}_MODEL`])
  if (providerWide) return providerWide

  if (provider === 'anthropic') {
    const legacy = getLegacyAnthropicModel(purpose)
    if (legacy) return legacy
  }

  return DEFAULT_MODELS[provider][purpose]
}

const PROVIDERS: Record<LlmProviderName, LlmProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
}

export function getProvider(name: LlmProviderName = getActiveProviderName()): LlmProvider {
  return PROVIDERS[name]
}

/**
 * The seam entry point for call sites: resolves the active provider + the
 * per-purpose model, runs the call, and emits one structured usage line
 * (the A/B instrument for comparing providers/models during the migration).
 */
export async function complete(req: LlmRequest): Promise<LlmResult> {
  const providerName = getProviderForPurpose(req.purpose)
  const model = getModel(req.purpose, providerName)
  const start = Date.now()
  const result = await PROVIDERS[providerName].chat(req, model)
  console.log(
    '[llm] ' +
      JSON.stringify({
        purpose: req.purpose,
        provider: providerName,
        model,
        input_tokens: result.usage.input,
        output_tokens: result.usage.output,
        duration_ms: Date.now() - start,
      })
  )
  return result
}
