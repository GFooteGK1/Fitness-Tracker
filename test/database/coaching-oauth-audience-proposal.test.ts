import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// This database is disposable in-memory qualification of a proposal. It never
// connects to Supabase or installs a hosted hook/credential/grant.
describe.each([
  ['proposal', 'docs/plans/socius-mcp-audience-hook.sql.template'],
  ['recovered historical migration', 'supabase/migrations/20261018220557_socius_pilot_context_audience.sql'],
])('%s on disposable synthetic PostgreSQL only', (_name, path) => {
const db = new PGlite(), client = '20000000-0000-4000-8000-000000000001'
const resource = 'https://www.sociusfit.com/api/mcp'
const original = (patch: Record<string, unknown> = {}) => ({
  user_id: '10000000-0000-4000-8000-000000000001', authentication_method: 'oauth_provider/authorization_code',
  claims: { aud: 'authenticated', sub: '10000000-0000-4000-8000-000000000001', role: 'authenticated',
    client_id: client, scope: 'email', exp: 9999999999, session_id: '30000000-0000-4000-8000-000000000001',
    user_metadata: { unrelated: 'synthetic' }, ...patch },
})
beforeAll(async () => {
  const template = readFileSync(resolve(process.cwd(), path), 'utf8')
  const binding = /#>>\s*'\{claims,client_id\}'\s*=\s*'([^']+)'/.exec(template)![1]
  // Substitute only in disposable fixture memory; committed historical binding stays exact.
  await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`)
  await db.exec(template.replace(binding, client))
})
afterAll(async () => { await db.close() })
async function transform(event: unknown) {
  return (await db.query<{ event: ReturnType<typeof original> }>('select public.socius_mcp_audience_hook($1::jsonb) as event', [JSON.stringify(event)])).rows[0].event
}

describe('native pilot audience hook contract', () => {
  it('adds only the canonical resource audience for the exact client and email scope', async () => {
    const event = original(), result = await transform(event)
    expect(result).toEqual({ ...event, claims: { ...event.claims, aud: ['authenticated', resource] } })
  })
  it('preserves existing audience arrays and does not duplicate the resource', async () => {
    const event = original({ aud: ['authenticated', 'https://other.synthetic.invalid/api'] })
    const result = await transform(event)
    expect(result.claims.aud).toEqual(['authenticated', 'https://other.synthetic.invalid/api', resource])
    expect(await transform(result)).toEqual(result)
  })
  it.each([
    { client_id: undefined }, { client_id: '20000000-0000-4000-8000-000000000002' },
    { scope: undefined }, { scope: 'openid email' }, { scope: 'profile' },
    { aud: null }, { aud: true }, { aud: 42 }, { aud: {} },
    { client_id: undefined, user_metadata: { client_id: client } },
  ])('leaves direct, other-client, broadened or malformed events unchanged: %j', async patch => {
    const event = JSON.parse(JSON.stringify(original(patch)))
    expect(await transform(event)).toEqual(event)
  })
  it('does not trust a top-level client_id in place of the signed claims binding', async () => {
    const event = { ...original({ client_id: 'other-client' }), client_id: client }
    expect(await transform(event)).toEqual(event)
  })
  it('also applies to refresh issuance without changing any other claim', async () => {
    const event = { ...original(), authentication_method: 'token_refresh' }
    expect(await transform(event)).toEqual({ ...event, claims: { ...event.claims, aud: ['authenticated', resource] } })
  })
  it('preserves the observed service_role grant and Auth service execution while rejecting app roles', async () => {
    const result = await db.query<{ role: string; allowed: boolean }>(
      "select role, has_function_privilege(role, 'public.socius_mcp_audience_hook(jsonb)', 'execute') as allowed from (values ('anon'), ('authenticated'), ('service_role'), ('supabase_auth_admin')) roles(role)")
    expect(result.rows).toEqual([
      { role: 'anon', allowed: false }, { role: 'authenticated', allowed: false }, { role: 'service_role', allowed: true }, { role: 'supabase_auth_admin', allowed: true },
    ])
  })
})

})
