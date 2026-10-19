import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { coachingReferencePointer, readCoachingReference, COACHING_REFERENCE_MAX_RESPONSE_BYTES } from '../../app/lib/coach/external-coaching-reference'
import { createCoachingReferenceTool } from '../../app/lib/coach/coaching-reference-tool'
import { contextClient, contextOwner } from '../fixtures/coaching-context'

const policy = { clientId: 'synthetic-client', issuer: 'https://auth.invalid', resource: 'https://synthetic.invalid/api/mcp' }
const principal = () => ({ ...policy, subject: contextOwner, role: 'authenticated', expiresAt: Date.now() + 60_000 })
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')

afterEach(() => vi.restoreAllMocks())

describe('versioned external qualitative coaching publication', () => {
  it('returns core, explicit authority, review scope, provenance and supersession independently of athlete data', () => {
    const result = readCoachingReference({})
    expect(result.selectedDomains).toEqual([])
    expect(result.reference.domains).toEqual({})
    expect(result.reference.review).toMatchObject({ interfaceReviewedAt: '2026-10-19', inheritedEvidenceReviewDate: '2026-10-17' })
    expect(result.reference.provenance.map(source => source.sourcePath)).toContain('docs/decisions/ADR-0039-chosen-llm-and-durable-context.md')
    expect(result.reference.supersession.scope).toBe('external_chosen_llm_interface_only')
    expect(result.reference.supersession.replacement).toContain('selected LLM authors programming')
    expect(result.reference.intendedPopulation).toContain('Generally healthy adult athletes')
    expect(result.reference.safetyBoundary.join(' ')).toContain('Do not diagnose, treat, rehabilitate')
    expect(result.reference.safetyBoundary.join(' ')).toContain('sharp or escalating pain')
    expect(JSON.stringify(result.reference)).not.toMatch(/Greg|APEX|five training days|five-day/i)
    expect(result.selectedContentHash).toBe(hash(result.reference))
  })

  it('binds the context pointer to the complete immutable publication and canonicalizes requested section order', () => {
    const first = readCoachingReference({ domains: ['conditioning', 'assessment', 'power', 'strength'] })
    const second = readCoachingReference({ domains: ['isometrics', 'recovery'] })
    const complete = { ...first.reference, domains: { ...first.reference.domains, ...second.reference.domains } }
    expect(hash(complete)).toBe(first.contentHash)
    expect(coachingReferencePointer()).toMatchObject({ status: 'available', version: first.version, contentHash: hash(complete), hashScope: 'complete_publication' })
    expect(readCoachingReference({ domains: ['strength', 'assessment'] })).toEqual(readCoachingReference({ domains: ['assessment', 'strength'] }))
    const original = readCoachingReference({ domains: ['isometrics'] })
    const mutated = readCoachingReference({ domains: ['isometrics'] })
    mutated.reference.principles[0] = 'mutated'
    mutated.reference.domains.isometrics?.push('mutated')
    mutated.reference.review.interfaceReviewedAt = 'mutated'
    expect(readCoachingReference({ domains: ['isometrics'] })).toEqual(original)
    expect(coachingReferencePointer('unknown')).toEqual({ status: 'unpublished', tool: 'get_coaching_reference', requestedVersion: 'unknown', reference: null })
  })

  it.each([null, [], 'strength', { version: 'unknown' }, { version: null }, { domains: 'strength' }, { domains: ['unknown'] },
    { domains: ['strength', 'strength'] }, { domains: ['assessment', 'strength', 'power', 'conditioning', 'recovery'] },
    { domains: [null] }, { user_id: 'foreign' }, { token: 'secret' }, { url: 'https://elsewhere.invalid' }, { sql: 'SELECT secret' }])('rejects invalid or unbounded selectors %j', input => {
    expect(() => readCoachingReference(input)).toThrow()
  })
})

describe('reference tool authorization and effect boundary', () => {
  it('uses verified principal plus db identity and returns bounded matching text/structured content with no domain effects', async () => {
    const { db, writes } = contextClient()
    const rpc = vi.fn(() => { throw new Error('RPC forbidden') })
    Object.assign(db, { rpc })
    const tool = createCoachingReferenceTool(async () => ({ principal: principal(), db }), policy)
    const domains = ['assessment', 'strength', 'power', 'isometrics']
    const result = await tool.call({ domains })
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent)
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(COACHING_REFERENCE_MAX_RESPONSE_BYTES)
    expect(result.structuredContent.reference.reference.domains.isometrics?.join(' ')).toContain('mandates no daily cadence')
    expect(db.auth.getUser).toHaveBeenCalledTimes(1)
    expect(db.from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(writes).not.toHaveBeenCalled()
  })

  it.each([{ subject: '' }, { clientId: 'other' }, { issuer: 'other' }, { resource: 'other' }, { expiresAt: 0 },
    { expiresAt: NaN }, { role: 'anon' }, { role: 'service_role' }])('rejects unqualified principal %j before db identity or domain access', async patch => {
    const { db } = contextClient()
    const tool = createCoachingReferenceTool(async () => ({ principal: { ...principal(), ...patch }, db }), policy)
    await expect(tool.call({})).rejects.toMatchObject({ status: 401 })
    expect(db.auth.getUser).not.toHaveBeenCalled()
    expect(db.from).not.toHaveBeenCalled()
  })

  it('rejects db subject mismatch and authentication errors before returning reference', async () => {
    const { db } = contextClient()
    const tool = createCoachingReferenceTool(async () => ({ principal: { ...principal(), subject: 'foreign' }, db }), policy)
    await expect(tool.call({})).rejects.toMatchObject({ status: 401 })
    vi.mocked(db.auth.getUser).mockResolvedValueOnce({ data: { user: null }, error: new Error('private') } as never)
    await expect(tool.call({})).rejects.toMatchObject({ status: 401 })
    expect(db.from).not.toHaveBeenCalled()
  })

  it('redacts verifier failures and does not fall back to another client', async () => {
    const tool = createCoachingReferenceTool(async () => { throw new Error('PRIVATE-CREDENTIAL') }, policy)
    await expect(tool.call({})).rejects.toMatchObject({ status: 503, message: 'Coaching reference is unavailable' })
  })
})
