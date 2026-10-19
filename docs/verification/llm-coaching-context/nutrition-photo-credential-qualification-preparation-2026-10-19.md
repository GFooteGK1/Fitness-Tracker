# In-place hosted credential metadata qualification: inactive preparation

## Scope

Prepare one owner-authenticated read-only endpoint:
GET /api/meals/photo-pilot/qualification. A separate literalfalse policy blocks it
before auth-client creation, environment-key inspection or any provider request.
No environment flag can enable it. The pilot's application/SQL gates stay false.
No user-facing coach/chat interface, new credential, key export, schema/storage
write, permission expansion, background job, paid POST or photo is introduced.

If separately approved and enabled, the server verifies the current owner using
existing Supabase getUser plus the fixed pilot owner filter. It reads the existing
hosted OPENAI_API_KEY only in its server process and performs at most two fixed
GETs, one per approved model: gpt-6-luna and gpt-5.6-luna. Owner identity is rechecked
before each. Arbitrary URL/model/query parameters are rejected. No redirects,
retries or fallback;5s fetch timeout and4KiB metadata response bound. Only200 with
an exact matching model id/object is available.401/403 is denied, other errors or
malformed/overlarge data unavailable. No raw provider body/header/key is returned
or logged. Responses are private/no-store and include the server read timestamp.

Configured means only that the server variable is nonempty. Available model
metadata establishes only permission to retrieve that metadata. Denied metadata
does not prove inference is denied; an inference-only key may lack model-read
permission. Neither outcome establishes paid Decisions/Responses endpoint access,
billing project, prices, data controls or ZDR. Those fields always remain explicitly
not_established. Do not substitute a local process key, export Vercel env, broaden
scopes, reconnect the provider or issue a paid probe to fill those gaps.

## Exact pending approval and execution scope

1. Land this independently tested literalfalse preparation normally. This has no
   provider traffic and requires no live migration or other activation flag.
2. If desired, approve an exact reviewed commit that flips only the separate
   qualification policy to true on the confirmed Socius deployment, leaving the
   photo pilot/SQL/tool gates disabled. No key or project settings change.
3. Invoke exactly one owner-authenticated GET in the existing Socius server
   environment; this permits only the two fixed metadata GETs, no generation or
   photos. Existing Vercel deployment access and owner login must be available;
   no arbitrary remote host execution or harness tool connection is assumed.
4. Record only redacted facts/timestamps and return the qualification flag to
   false through a reviewed normal code change if temporary qualification was
   intended. Any paid canary, SQL application, permanent deletion or production
   photo-pilot activation still needs its own exact approval.

This endpoint has not been enabled or invoked against a hosted provider. Existing
sensitive Vercel key metadata confirms configured destinations, not key validity.
Synthetic tests use a fake owner predicate, inert fetch, synthetic credentials and
no hosted Auth/Storage/DB/provider. Runtime owner login/hosted key suitability are
unproved. No installed software or broader access is required by the preparation.
