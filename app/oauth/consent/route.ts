import { createServerClient } from '@/app/lib/auth/supabase-server'
import { coachingOAuthConfig, coachingOAuthError, coachingPrivateHeaders } from '@/app/lib/auth/coaching-oauth'
import { coachingConsentRequest, decideCoachingConsent, escapeConsentHtml as escape, readCoachingConsent } from '@/app/lib/auth/coaching-consent'
import { CoachingContextError } from '@/app/lib/coach/coaching-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { ...coachingPrivateHeaders, 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" }
// Preserve the browser's same-origin form Origin without sending the review URL
// to external destinations. Sign-in/error pages and redirects stay no-referrer.
const page = (body: string, status = 200, redirectUri?: string) => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Socius</title><style>body{font:18px system-ui;line-height:1.5;max-width:38rem;padding:24px;margin:auto}button,a{min-height:44px;padding:12px;display:inline-block}button{font:inherit;margin:8px 12px 8px 0}li{margin:6px 0}</style><main><h1>Connect Socius to ChatGPT</h1>${body}</main></html>`, { status, headers: { ...headers, ...(status === 200 && redirectUri ? {
  'Referrer-Policy': 'same-origin',
  // Chromium also checks form-action on the 303 target. Add the validated
  // callback; coachingConsentRedirect still enforces its exact path server-side.
  'Content-Security-Policy': headers['Content-Security-Policy'].replace("form-action 'self';", `form-action 'self' ${redirectUri};`),
} : {}) } })

export async function GET(request: Request) {
  try {
    const config = coachingOAuthConfig(), entry = coachingConsentRequest(request.url, config.origin)
    if (entry.redirect) return new Response(null, { status: 303, headers: { ...coachingPrivateHeaders, Location: entry.redirect } })
    const consent = await readCoachingConsent(await createServerClient(), entry.authorizationId, config)
    if (consent.kind === 'redirect') return new Response(null, { status: 303, headers: { ...coachingPrivateHeaders, Location: consent.redirect } })
    return page(`<p>Account: ${escape(consent.account)}</p><p>Connection: ${escape(consent.clientName)}</p><p>Requested permissions:</p><ul>${consent.scopes.map(scope => `<li>${escape(scope)}</li>`).join('')}</ul>
      <p>The first tool reads your goals, constraints, saved plan, workouts and recovery. This owner-account connection may also carry broader rights to read, change or delete your Socius records. The read-only tool does not narrow those credential rights.</p>
      <p>The OAuth connection can include refresh access so ChatGPT can stay connected until you disconnect or revoke it. Email permission does not limit the credential's database rights.</p>
      <p>ChatGPT and your supported dot can use the connection when it is installed and enabled. You can disconnect it and revoke its grant later. Declining this request does not revoke an earlier connection.</p>
      <form method="post" action="/oauth/consent"><input type="hidden" name="authorization_id" value="${escape(consent.authorizationId)}"><input type="hidden" name="snapshot" value="${consent.snapshot}">
      <button type="submit" name="decision" value="approve">Allow this connection</button><button type="submit" name="decision" value="deny">Decline</button></form>`, 200, config.redirectUri)
  } catch (error) {
    if (error instanceof CoachingContextError && error.status === 401) return page(`<p>Sign in to Socius, then return to this tab to review the connection.</p><a href="/auth/signin" target="_blank" rel="noopener">Sign in to Socius</a><p><a href="${escape(new URL(request.url).pathname + new URL(request.url).search)}">Continue after signing in</a></p>`, 401)
    return coachingOAuthError(error)
  }
}

export async function POST(request: Request) {
  try {
    const config = coachingOAuthConfig()
    if (request.headers.get('origin') !== config.origin || new URL(request.url).origin !== config.origin
      || request.headers.get('content-type')?.split(';')[0] !== 'application/x-www-form-urlencoded') throw new CoachingContextError(400, 'Invalid consent origin or form')
    const body = await request.text()
    if (body.length > 8192) throw new CoachingContextError(400, 'Consent form is too large')
    const redirect = await decideCoachingConsent(await createServerClient(), new URLSearchParams(body), config)
    return new Response(null, { status: 303, headers: { ...coachingPrivateHeaders, Location: redirect } })
  } catch (error) { return coachingOAuthError(error) }
}
