/** Additional harness isolation; real handlers retain authentication/authorization. */
export type BrowserResource = 'candidate' | 'decision' | 'proposal' | 'session' | 'plan'
type Lookup = (kind: BrowserResource, id: string) => Promise<string | null>
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
export async function isolatedBrowserRequest(method: string, url: URL, body: unknown,
  fixture: { programId: string; enrollmentId: string }, lookup: Lookup): Promise<boolean> {
  const p = url.pathname, same = async (kind: BrowserResource, id: unknown) => uuid(id) && await lookup(kind, id) === fixture.programId
  const draft = async (v: unknown) => record(v) && v.programId === fixture.programId && v.enrollmentId === fixture.enrollmentId
    && await same('plan', v.basePlanVersionId)
  const operation = async (q: unknown, op: string) => {
    if (!record(q)) return false
    if (op === 'submit' || op === 'preview') return draft(q.draft)
    if (op === 'decide') return q.enrollmentId === fixture.enrollmentId && same('candidate', q.candidateId)
    if (op === 'issue') return q.programId === fixture.programId && same('candidate', q.candidateId)
    return false
  }
  if (p === '/api/coach/supervised/programs') return method === 'GET' && url.search === ''
  const s = p.match(/^\/api\/coach\/supervised\/(programs|candidates|decisions)\/([a-f0-9-]+)(?:\/(draft))?$/)
  if (s) return s[1] === 'programs' ? s[2] === fixture.programId && (method === 'GET' && !s[3] || method === 'POST' && s[3] === 'draft')
    : method === 'GET' && !s[3] && await same(s[1] === 'candidates' ? 'candidate' : 'decision', s[2])
  if (method === 'POST') {
    if (p === '/api/coach/supervised/candidates') return operation(body, 'submit')
    if (p === '/api/coach/supervised/candidates/preview') return operation(body, 'preview')
    if (p === '/api/coach/supervised/decisions') return operation(body, 'decide')
    if (p === '/api/coach/supervised/issue') return operation(body, 'issue')
    if (p === '/api/coach/supervised/resolve' || p === '/api/coach/supervised/resolution') return record(body)
      && record(body.pending) && body.pending.programId === fixture.programId && await operation(body.pending.body, body.pending.operation)
    if (p === '/api/coach/supervised/recover') return record(body) && record(body.identity) && body.programId === fixture.programId
      && await same('candidate', body.identity.registrationId)
  }
  if (p === '/api/coach/reviewed/proposals') return method === 'POST' // Disabled factory rejects issuance before mutation.
    || method === 'GET' && url.searchParams.getAll('programId').length === 1 && url.searchParams.get('programId') === fixture.programId
  const r = p.match(/^\/api\/coach\/reviewed\/(sessions|proposals|programs)\/([a-f0-9-]+)(?:\/(sets|complete|resolve|accept))?$/)
  if (!r) return false
  return r[1] === 'programs' ? r[2] === fixture.programId : same(r[1] === 'sessions' ? 'session' : 'proposal', r[2])
}
