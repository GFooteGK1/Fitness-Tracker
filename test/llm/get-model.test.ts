/**
 * Tests for the LLM seam's model/provider selection (getModel).
 *
 * Locks the ported semantics: provider default is anthropic (backward compat),
 * legacy ANTHROPIC_* envs still work, the retired-model blocklist is honored,
 * and the new provider-aware override precedence resolves correctly.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { getModel, getActiveProviderName, getProviderForPurpose } from '../../app/lib/llm/client'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getActiveProviderName', () => {
  it('defaults to anthropic when LLM_PROVIDER is unset', () => {
    expect(getActiveProviderName()).toBe('anthropic')
  })

  it('selects openai when LLM_PROVIDER=openai (case-insensitive)', () => {
    vi.stubEnv('LLM_PROVIDER', 'OpenAI')
    expect(getActiveProviderName()).toBe('openai')
  })
})

describe('getProviderForPurpose', () => {
  it('defaults to the global provider when no per-purpose override is set', () => {
    expect(getProviderForPurpose('vision')).toBe('anthropic')
    vi.stubEnv('LLM_PROVIDER', 'openai')
    expect(getProviderForPurpose('vision')).toBe('openai')
  })

  it('per-purpose override beats the global provider', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai') // global = openai
    vi.stubEnv('LLM_VISION_PROVIDER', 'anthropic') // but keep vision on anthropic
    expect(getProviderForPurpose('vision')).toBe('anthropic')
    expect(getProviderForPurpose('nutrition')).toBe('openai') // unaffected -> global
  })

  it('an override can also opt a single purpose INTO openai while the rest stay anthropic', () => {
    vi.stubEnv('LLM_NUTRITION_PROVIDER', 'openai')
    expect(getProviderForPurpose('nutrition')).toBe('openai')
    expect(getProviderForPurpose('vision')).toBe('anthropic') // global default
  })
})

describe('getModel respects the per-purpose provider', () => {
  it('resolves the model from the purpose-selected provider', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai')
    vi.stubEnv('LLM_VISION_PROVIDER', 'anthropic')
    // vision -> anthropic default; nutrition -> openai default
    expect(getModel('vision')).toBe('claude-sonnet-4-6')
    expect(getModel('nutrition')).toBe('gpt-5.4-nano')
  })
})

describe('getModel — anthropic (default provider)', () => {
  it('returns the anthropic defaults per purpose', () => {
    expect(getModel('default')).toBe('claude-sonnet-4-6')
    expect(getModel('fast')).toBe('claude-haiku-4-5-20251001')
  })

  it('honors legacy ANTHROPIC_* per-purpose envs', () => {
    vi.stubEnv('ANTHROPIC_VISION_MODEL', 'claude-vision-custom')
    expect(getModel('vision')).toBe('claude-vision-custom')
  })

  it('ignores a retired model id in env and falls back to the default', () => {
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-sonnet-4-20250514') // retired
    expect(getModel('default')).toBe('claude-sonnet-4-6')
  })
})

describe('getModel — openai', () => {
  it('returns the cost-strategy defaults per purpose', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai')
    expect(getModel('vision')).toBe('gpt-5.6-luna')
    expect(getModel('nutrition')).toBe('gpt-5.4-nano')
    expect(getModel('agent')).toBe('gpt-5.6-terra')
    expect(getModel('fast')).toBe('gpt-5.4-nano')
  })

  it('per-purpose env override wins over the default', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai')
    vi.stubEnv('LLM_OPENAI_VISION_MODEL', 'gpt-5.4-nano')
    expect(getModel('vision')).toBe('gpt-5.4-nano')
  })

  it('provider-wide override applies when no per-purpose override is set', () => {
    vi.stubEnv('LLM_PROVIDER', 'openai')
    vi.stubEnv('LLM_OPENAI_MODEL', 'gpt-5.6-terra')
    expect(getModel('nutrition')).toBe('gpt-5.6-terra')
  })

  it('can be targeted explicitly regardless of the active provider', () => {
    expect(getModel('vision', 'openai')).toBe('gpt-5.6-luna')
  })
})
