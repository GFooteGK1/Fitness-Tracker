/**
 * Property-Based Tests for Agent Router
 *
 * Feature: agent-system, Property 2: Router behavior matches classification
 * Feature: agent-system, Property 3: Multi-domain responses contain one message per domain
 *
 * **Validates: Requirements 1.2, 1.3, 1.4, 7.6**
 */

import { fc, test } from '@fast-check/vitest'
import { describe, expect } from 'vitest'
import { determineRoute, executeRoute, buildClarificationMessage } from '@/app/lib/agents/router'
import type { RouteDecision, AgentCaller } from '@/app/lib/agents/router'
import type { ClassificationResult, AgentDomain, AgentMessage, AgentRequest } from '@/app/lib/agents/types'

const propertyConfig = { numRuns: 100 }

const VALID_DOMAINS: AgentDomain[] = ['trainer', 'nutritionist', 'socius']

// Generators
const arbDomain = fc.constantFrom<AgentDomain>(...VALID_DOMAINS)

const arbClassification = (opts?: { minConfidence?: number; maxConfidence?: number; domainCount?: number }) =>
  fc.record({
    input_type: fc.constantFrom('workout_log', 'meal_log', 'question', 'mixed', 'unclear' as const),
    domains: fc.array(arbDomain, {
      minLength: opts?.domainCount ?? 1,
      maxLength: opts?.domainCount ?? 3
    }),
    confidence: fc.float({
      min: Math.fround(opts?.minConfidence ?? 0),
      max: Math.fround(opts?.maxConfidence ?? 1),
      noNaN: true
    }),
    context: fc.record({
      has_portions: fc.boolean(),
      has_score: fc.boolean(),
      is_benchmark: fc.boolean()
    })
  }) as fc.Arbitrary<ClassificationResult>

/** Build a stub caller that returns one message per domain */
function buildStubCallers(): Record<AgentDomain, AgentCaller> {
  const makeCaller = (domain: AgentDomain): AgentCaller =>
    async (_userId, _content, _request, _prev) => [{
      role: domain,
      content: `Response from ${domain}`,
      domain,
      confidence: 0.9
    }]

  return {
    trainer: makeCaller('trainer'),
    nutritionist: makeCaller('nutritionist'),
    socius: makeCaller('socius')
  }
}

const stubRequest: AgentRequest = { content: 'test', input_mode: 'text' }

describe('Router Properties', () => {

  /**
   * Property 2a: Low confidence (< 0.5) always returns clarify
   */
  test.prop(
    [arbClassification({ minConfidence: 0, maxConfidence: Math.fround(0.49) })],
    propertyConfig
  )('Property 2: low confidence returns clarify decision', (classification) => {
    const decision = determineRoute(classification)
    expect(decision.type).toBe('clarify')
  })

  /**
   * Property 2b: Single domain with confidence >= 0.5 returns single
   */
  test.prop(
    [arbClassification({ minConfidence: Math.fround(0.5), maxConfidence: 1, domainCount: 1 })],
    propertyConfig
  )('Property 2: single domain returns single decision', (classification) => {
    const decision = determineRoute(classification)
    expect(decision.type).toBe('single')
    if (decision.type === 'single') {
      expect(decision.domain).toBe(classification.domains[0])
    }
  })

  /**
   * Property 2c: Multiple domains with confidence >= 0.5 returns multi
   */
  test.prop(
    [
      fc.record({
        input_type: fc.constantFrom('mixed' as const),
        domains: fc.array(arbDomain, { minLength: 2, maxLength: 3 }),
        confidence: fc.float({ min: Math.fround(0.5), max: Math.fround(1), noNaN: true }),
        context: fc.record({
          has_portions: fc.boolean(),
          has_score: fc.boolean(),
          is_benchmark: fc.boolean()
        })
      }) as fc.Arbitrary<ClassificationResult>
    ],
    propertyConfig
  )('Property 2: multiple domains returns multi decision', (classification) => {
    const decision = determineRoute(classification)
    expect(decision.type).toBe('multi')
    if (decision.type === 'multi') {
      expect(decision.domains).toEqual(classification.domains)
    }
  })

  /**
   * Property 2d: Empty domains always returns clarify regardless of confidence
   */
  test.prop(
    [fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true })],
    propertyConfig
  )('Property 2: empty domains returns clarify', (confidence) => {
    const classification: ClassificationResult = {
      input_type: 'unclear',
      domains: [],
      confidence,
      context: { has_portions: false, has_score: false, is_benchmark: false }
    }
    const decision = determineRoute(classification)
    expect(decision.type).toBe('clarify')
  })

  /**
   * Property 2e: Clarify route returns a system message, no agent calls
   */
  test.prop(
    [arbClassification({ minConfidence: 0, maxConfidence: Math.fround(0.49) })],
    propertyConfig
  )('Property 2: clarify route returns system message', async (classification) => {
    const decision = determineRoute(classification)
    const messages = await executeRoute(decision, 'user-1', 'test', stubRequest, buildStubCallers())
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('system')
  })
})

describe('Multi-Domain Response Properties', () => {

  /**
   * Property 3a: Multi-domain responses contain exactly N messages for N domains
   */
  test.prop(
    [fc.array(arbDomain, { minLength: 2, maxLength: 3 })],
    propertyConfig
  )('Property 3: multi-domain response has one message per domain', async (domains) => {
    const decision: RouteDecision = { type: 'multi', domains }
    const messages = await executeRoute(decision, 'user-1', 'test', stubRequest, buildStubCallers())
    expect(messages).toHaveLength(domains.length)
  })

  /**
   * Property 3b: Each message in multi-domain response is attributed to the correct domain
   */
  test.prop(
    [fc.array(arbDomain, { minLength: 2, maxLength: 3 })],
    propertyConfig
  )('Property 3: each message attributed to correct domain in order', async (domains) => {
    const decision: RouteDecision = { type: 'multi', domains }
    const messages = await executeRoute(decision, 'user-1', 'test', stubRequest, buildStubCallers())
    for (let i = 0; i < domains.length; i++) {
      expect(messages[i].domain).toBe(domains[i])
      expect(messages[i].role).toBe(domains[i])
    }
  })

  /**
   * Property 3c: Single domain response has exactly 1 message
   */
  test.prop(
    [arbDomain],
    propertyConfig
  )('Property 3: single domain response has exactly 1 message', async (domain) => {
    const decision: RouteDecision = { type: 'single', domain }
    const messages = await executeRoute(decision, 'user-1', 'test', stubRequest, buildStubCallers())
    expect(messages).toHaveLength(1)
    expect(messages[0].domain).toBe(domain)
  })

  /**
   * Property 3d: Sequential pipeline passes previous messages to later agents
   */
  test.prop(
    [fc.array(arbDomain, { minLength: 2, maxLength: 3 })],
    propertyConfig
  )('Property 3: sequential pipeline passes previous messages', async (domains) => {
    const receivedPrevious: AgentMessage[][] = []
    const callers: Record<AgentDomain, AgentCaller> = {
      trainer: async (_u, _c, _r, prev) => { receivedPrevious.push([...prev]); return [{ role: 'trainer', content: 'ok', domain: 'trainer' }] },
      nutritionist: async (_u, _c, _r, prev) => { receivedPrevious.push([...prev]); return [{ role: 'nutritionist', content: 'ok', domain: 'nutritionist' }] },
      socius: async (_u, _c, _r, prev) => { receivedPrevious.push([...prev]); return [{ role: 'socius', content: 'ok', domain: 'socius' }] }
    }

    const decision: RouteDecision = { type: 'multi', domains }
    await executeRoute(decision, 'user-1', 'test', stubRequest, callers)

    // First agent gets empty previous, subsequent agents get accumulating messages
    expect(receivedPrevious[0]).toHaveLength(0)
    for (let i = 1; i < domains.length; i++) {
      expect(receivedPrevious[i]).toHaveLength(i)
    }
  })
})
