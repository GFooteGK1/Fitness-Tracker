import { describe, it, expect } from 'vitest'
import { isolatedBrowserRequest, type BrowserResource } from '../../scripts/release/supervised-browser-scope'
const fixture = { programId: '11111111-1111-4111-8111-111111111111', enrollmentId: '22222222-2222-4222-8222-222222222222' }
const owned = '33333333-3333-4333-8333-333333333333', other = '44444444-4444-4444-8444-444444444444'
const url = (p: string) => new URL(`http://127.0.0.1:3013/api/coach/${p}`)
const lookup = async (_kind: BrowserResource, id: string) => id === owned ? fixture.programId : '55555555-5555-4555-8555-555555555555'
const allows = (method: string, p: string, body: unknown = null) => isolatedBrowserRequest(method, url(p), body, fixture, lookup)
describe('local browser fixture isolation', () => {
  it('allows only the fixed program and pageless discovery', async () => {
    expect(await allows('GET', 'supervised/programs')).toBe(true)
    expect(await allows('GET', 'supervised/programs?afterProgramId=' + other)).toBe(false)
    expect(await allows('POST', `supervised/programs/${other}/draft`, {})).toBe(false)
    expect(await allows('POST', `supervised/programs/${fixture.programId}/draft`, {})).toBe(true)
  })
  it('checks candidate, decision, proposal and session lineage before dispatch', async () => {
    for (const p of ['supervised/candidates/', 'supervised/decisions/', 'reviewed/proposals/', 'reviewed/sessions/']) {
      expect(await allows('GET', p + owned)).toBe(true)
      expect(await allows('GET', p + other)).toBe(false)
    }
    for (const p of ['reviewed/sessions/' + other + '/sets', 'reviewed/proposals/' + other + '/accept', 'reviewed/programs/' + other + '/resolve']) expect(await allows('POST', p, {})).toBe(false)
  })
  it('rejects foreign bases, enrollments, candidates and nested pending requests', async () => {
    const draft = { ...fixture, basePlanVersionId: owned }
    expect(await allows('POST', 'supervised/candidates', { draft })).toBe(true)
    expect(await allows('POST', 'supervised/candidates/preview', { draft: { ...draft, basePlanVersionId: other } })).toBe(false)
    expect(await allows('POST', 'supervised/candidates', { draft: { ...draft, enrollmentId: other } })).toBe(false)
    expect(await allows('POST', 'supervised/decisions', { enrollmentId: fixture.enrollmentId, candidateId: other })).toBe(false)
    expect(await allows('POST', 'supervised/issue', { programId: fixture.programId, candidateId: other })).toBe(false)
    const pending = { programId: fixture.programId, operation: 'submit', body: { draft } }
    expect(await allows('POST', 'supervised/resolve', { pending })).toBe(true)
    expect(await allows('POST', 'supervised/resolution', { pending: { ...pending, body: { draft: { ...draft, programId: other } } } })).toBe(false)
    expect(await allows('POST', 'supervised/recover', { programId: fixture.programId, identity: { registrationId: other } })).toBe(false)
  })
})
