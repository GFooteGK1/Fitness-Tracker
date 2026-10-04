/** Four fixed denial envelopes only. No authority to construct replacement requests. */
import { createHash } from 'node:crypto'
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function denialProbe(source, operation, actor) {
  const p = source.requests[operation]
  if (!p || p.body.expectedUserId !== actor || p.bodySha256 !== sha(p.body)) throw Error('Exact reserved owner envelope required')
  return p
}
export function fixedDenialBody(source, pathname, body, raw) {
  if (typeof raw !== 'string') return false
  const rawSha = createHash('sha256').update(raw).digest('hex')
  return Object.values(source.requests).some(p => p.path === pathname && p.method === 'POST' && p.bodySha256 === sha(body) && p.bodySha256 === rawSha)
}
export function allowedDenialPath(source, method, pathname, search = '') {
  if (search && !pathname.startsWith('/_next/')) return false
  if (method === 'GET' && (pathname.startsWith('/_next/') || ['/favicon.ico', '/manifest.json', '/icon-192.png', '/icon-512.png',
    '/local-supervised-test', '/auth/signin', '/api/local-supervised-test/identity', '/api/profile'].includes(pathname))) return true
  if (method === 'POST' && ['/api/local-supervised-test/login', '/api/local-supervised-test/probe', '/api/whoop/initialize'].includes(pathname)) return true
  return Object.values(source.requests).some(p => p.path === pathname && p.method === method)
}
