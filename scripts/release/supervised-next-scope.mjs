/** Pure controls for a retained, revoked synthetic fixture. No application authority. */
export const sourceRun = '15dd9ac3-c64c-4763-85d1-1bfd98cebf4c'
export const sourceSha = '1ee939a539463b0e0162c191afac87c40f6b642e8732a866e99172248e6ca907'
export const revokedEnrollment = 'de749e5e-eb87-43e5-9f65-277474241d0b'
export const sourceProgram = '3a803777-c825-44d0-a563-6b51ae64dbe5'
export function originalProbe(source, operation, actor, denialId) {
  const posts = source.journal.filter(e => e.name === 'browser_http' && e.payload.method === 'POST')
  const paths = { submit: '/api/coach/supervised/candidates', decide: '/api/coach/supervised/decisions', issue: '/api/coach/supervised/issue' }
  if (Object.hasOwn(paths, operation)) {
    const original = posts.find(e => e.payload.path === paths[operation])
    if (!original) throw Error('Original confirmed request missing')
    return { path: '/api/coach/supervised/resolution', body: { expectedUserId: actor,
      pending: { schemaVersion: 1, userId: original.payload.body.expectedUserId, programId: source.programId, operation, body: original.payload.body } } }
  }
  if (operation === 'session') {
    const original = posts.find(e => e.payload.path.endsWith('/sets'))
    if (!original) throw Error('Original session missing')
    return { path: original.payload.path.replace(/\/sets$/, ''), method: 'GET' }
  }
  if (operation === 'candidate') {
    const original = posts.find(e => e.payload.path === paths.submit)
    return { path: '/api/coach/supervised/candidates/' + original.result.result.candidate.candidateId, method: 'GET' }
  }
  if (operation === 'new_issue') {
    const original = posts.find(e => e.payload.path === paths.issue)
    if (actor !== original.payload.body.expectedUserId || !/^[a-f0-9-]{36}$/.test(denialId ?? '')) throw Error('One reserved original-owner denial request required')
    return { path: paths.issue, body: { ...original.payload.body, expectedUserId: actor, requestId: denialId } }
  }
  if (['accept', 'set', 'complete'].includes(operation)) {
    const e = posts.find(e => e.payload.path.endsWith('/' + ({ accept: 'accept', set: 'sets', complete: 'complete' }[operation])))
    if (!e) throw Error('Original confirmed execution request missing')
    const identity = operation === 'accept' ? { proposalId: e.payload.path.split('/').at(-2), planVersionId: e.result.result.accepted.active_plan_version_id }
      : { sessionId: e.payload.path.split('/').at(-2), [operation === 'set' ? 'report' : 'completion']: e.payload.body[operation === 'set' ? 'report' : 'completion'] }
    return { path: '/api/coach/supervised/recover', body: { expectedUserId: actor, programId: source.programId,
      operation, requestId: e.payload.body.requestId, identity } }
  }
  throw Error('Unknown fixed qualification operation')
}

export function safeNextResult(value) {
  if (!value || typeof value !== 'object') return { json: false }
  const result = { fields: Object.keys(value).sort() }
  for (const key of ['kind', 'userId', 'writesEnabled', 'globalNumericalPolicy', 'supervisedEnabled']) if (Object.hasOwn(value, key)) result[key] = value[key]
  if (value.page) {
    result.actorId = value.page.actorId
    result.programIds = value.page.programs?.map(p => p.programId)
    if (value.page.program) result.program = { programId: value.page.program.programId, role: value.page.program.role,
      enrollmentId: value.page.program.latestEnrollment?.enrollmentId, enabled: value.page.program.latestEnrollment?.enabled,
      version: value.page.program.latestEnrollment?.version }
  }
  if (value.resolution) {
    const r = value.resolution, saved = r.result
    result.resolution = { operation: r.operation, disposition: r.disposition,
      candidateId: saved?.candidate?.candidateId, decisionId: saved?.receipt?.decisionId,
      proposalId: saved?.proposalId, planVersionId: saved?.planVersionId }
  }
  if (value.receipt) {
    const r = value.receipt.result
    result.receipt = { operation: value.receipt.operation, requestId: value.receipt.requestId,
      reportId: r?.id, activePlanVersionId: r?.active_plan_version_id,
      sessionId: r?.result?.prescribed_session_id, workoutId: r?.result?.workout_id }
  }
  return result
}

const stable = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
export function fixedNextBody(source, pathname, body, denialId) {
  return source.users.some(u => ['submit', 'decide', 'issue', 'accept', 'set', 'complete', 'new_issue'].some(operation => {
    try { const p = originalProbe(source, operation, u.id, denialId); return p.path === pathname && stable(p.body) === stable(body) } catch { return false }
  }))
}

export function provenNextProbe(journal, entry, status, kind) {
  const intended = entry.payload.intended, inner = journal[entry.payload.innerJournalIndex]
  return entry.disposition === 'response_received' && entry.result.status === 200
    && entry.result.probeStatus === status && entry.result.kind === kind
    && inner?.name === 'next_http' && inner.disposition === 'response_received'
    && inner.payload.path === intended?.path && inner.payload.method === intended.method
    && inner.result.status === status && inner.result.kind === kind
    && (!intended.bodySha256 || (inner.payload.bodySha256 === intended.bodySha256
      && inner.payload.requestId === intended.requestId))
}

export function nextSnapshotSql(tables) {
  if (!Array.isArray(tables) || !tables.length || new Set(tables).size !== tables.length
    || !tables.every(t => typeof t === 'string' && /^[a-z_][a-z0-9_]*$/.test(t) && t !== 'auth_identity')) throw Error('Unexpected snapshot table name')
  const selections = tables.map(t => `SELECT '${t}' AS table_name,coalesce(jsonb_object_agg(h,nb),'{}'::jsonb) AS rows FROM (SELECT md5(to_jsonb(t)::text) h,count(*) nb FROM public."${t}" t GROUP BY 1) d`)
  selections.push("SELECT 'auth_identity',coalesce(jsonb_object_agg(h,nb),'{}'::jsonb) FROM (SELECT md5(jsonb_build_object('id',id,'email',email,'deleted_at',deleted_at)::text) h,count(*) nb FROM auth.users GROUP BY 1) d")
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='1s'; SELECT jsonb_object_agg(table_name,rows) FROM (${selections.join(' UNION ALL ')}) snapshots; ROLLBACK;`
}

export function allowedNextPath(source, method, pathname, search = '') {
  if (method === 'GET' && pathname === '/api/coach/reviewed/proposals') {
    const query = new URLSearchParams(search)
    return [...query.keys()].join(',') === 'programId' && query.get('programId') === source.programId
  }
  if (method === 'GET' && (pathname.startsWith('/_next/') || ['/favicon.ico', '/manifest.json', '/icon-192.png', '/icon-512.png'].includes(pathname))) return true
  if (method === 'GET' && ['/local-supervised-test', '/auth/signin', '/api/local-supervised-test/identity', '/api/profile', '/program/supervised',
    '/api/coach/supervised/programs'].includes(pathname)) return true
  if (method === 'POST' && ['/api/local-supervised-test/login', '/api/local-supervised-test/probe', '/api/whoop/initialize',
    '/api/coach/supervised/resolution', '/api/coach/supervised/recover', '/api/coach/supervised/issue'].includes(pathname)) return true
  const ids = new Set([source.programId])
  for (const e of source.journal.filter(e => e.name === 'browser_http' && e.payload.method === 'POST')) {
    for (const value of [e.result.result.candidate?.candidateId, e.result.result.proposalId, e.payload.path.split('/').at(-2)])
      if (typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value)) ids.add(value)
  }
  return method === 'GET' && /^\/(?:program\/reviewed\/(?:plans\/)?|api\/coach\/supervised\/(?:programs|candidates)\/|api\/coach\/reviewed\/(?:sessions|proposals)\/)[a-f0-9-]{36}$/.test(pathname)
    && ids.has(pathname.split('/').at(-1))
}
