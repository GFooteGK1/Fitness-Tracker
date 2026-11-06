# SociusFit current architecture overview

Source checked on **November 6, 2026**, against
`bae5675d4ff6ab973c707e06f2b7a5fa60acdd50`. This is a source and contract overview,
not a readback of deployed settings or a general product-acceptance certificate.

## Accepted target and current implementation

[ADR-0039](../decisions/ADR-0039-chosen-llm-and-durable-context.md) assigns
conversation, interpretation, program selection/authorship and synthesis to the
athlete's chosen LLM. Socius owns durable model-independent records, provenance
and history, deterministic calculations and narrow validated operations.

That decision supersedes the old target in which the application necessarily
prescribed programming and a model only explained it. It does not remove useful
domain arithmetic or structural validation, rewrite historical policy snapshots,
confirm inferred athlete facts, or authorize deletion of accepted plans.

The transition is incremental. The external owner-pilot tool service coexists
with the embedded application. Existing authoring and ingestion paths remain
until separately qualified replacements and retirement decisions exist. The
[architecture map](ARCHITECTURE-MAP.md) supplies the broader module inventory.

| Layer | Current source responsibility | Evidence |
| --- | --- | --- |
| Selected LLM interface | Target home for conversation and programming reasoning | [ADR-0039](../decisions/ADR-0039-chosen-llm-and-durable-context.md) |
| MCP transport and authorization | Request-local tool dispatch with verified owner/client/resource/grant checks | [MCP route](../../app/api/mcp/route.ts), [transport](../../app/lib/coach/coaching-mcp-http.ts), [OAuth verifier](../../app/lib/auth/coaching-oauth.ts) |
| Domain services | Factual projection, typed validation, normalization, revision-bound corrections and receipt recovery | [Context reader](../../app/lib/coach/coaching-context-server.ts), [activity tools](../../app/lib/coach/activity-record-tools.ts), [capture service](../../app/lib/capture/service.ts) |
| Supabase | Existing Auth, owner-scoped data and transactional persistence contracts | [Server clients](../../app/lib/auth/supabase-server.ts), [migrations](../../supabase/migrations) |
| Retained web application | Direct entry, views and embedded model-backed workflows | [Application paths below](#retained-application-and-provider-dependencies) |

## External tools and rollout gates

The [MCP registration](../../app/lib/coach/coaching-context-mcp.ts) combines the
two coaching tools with the six descriptors in the
[activity contract](../../app/lib/coach/activity-record-contract.ts). These are
**eight source descriptors**, not eight universally enabled tools:

| Tool | Scope in the current contract |
| --- | --- |
| `get_coaching_context` | Bounded factual requirements, accepted programming, performed work, evidence, metrics/assessments and recovery, with dates and gaps |
| `get_coaching_reference` | Versioned qualitative reference guidance, distinct from athlete records |
| `get_activity_record` | Owned workout/meal lookup by known ID, including retained fields and revision |
| `get_activity_write_status` | Recovery by original request ID; receipt absence remains unresolved |
| `create_workout` | Typed completed-work facts with explicit intent and provenance |
| `amend_workout` | Revision-bound owned corrections, subject to format and additional activation checks |
| `create_meal` | Typed consumed-meal facts with supplied item macros; deterministic totals |
| `amend_meal` | Revision-bound item/timestamp corrections preserving estimate origins |

[Tool descriptions and implementation](../../app/lib/coach/activity-record-tools.ts)
require stable request identities, truthful provenance and saved-revision
readback. Review does not turn an estimate into a measurement. Missing meal
macros reject rather than becoming zero. Activity operations do not call a model,
analyze photos or change accepted prescriptions/goals.

The source gates are separate:

- `SOCIUS_MCP_ENABLED=true` and valid configuration are required by the
  [connection configuration](../../app/lib/auth/coaching-oauth.ts).
- Without `SOCIUS_MCP_WRITES_ENABLED=true`, normal runtime registration omits
  the four writes and dispatch does not make them callable. Four read descriptors
  remain, subject to the connection and authorization checks.
- `amend_workout` additionally checks
  `SOCIUS_MCP_ACTIVITY_CORRECTIONS_V2_ENABLED=true`. Its persistence migration
  and supported record formats need qualification; see
  [ADR-0044](../decisions/ADR-0044-chatgpt-activity-record-operations.md).
- These source defaults/checks do not disclose the current hosted flag values.
  A merge does not supply activation authority or prove a real-owner write.

## Owner-pilot authorization boundary

The [OAuth verifier](../../app/lib/auth/coaching-oauth.ts) checks token signature,
issuer, resource audience, configured client, authenticated subject, expiry and
active provider grant. Configuration pins the existing Supabase origin and
approved ChatGPT callback patterns. Current descriptors request exactly
`email`; they do not define general multi-client or multi-user authorization.

The normal owner credential can carry broader database rights than the listed
tools. Read-only annotations or a short tool list do not narrow that credential.
[ADR-0038](../decisions/ADR-0038-external-context-authorization.md) and
[ADR-0039](../decisions/ADR-0039-chosen-llm-and-durable-context.md) preserve the
owner-pilot scope and qualification limits. Source safeguards and synthetic tests
are not a blanket security certification or evidence of every hosted policy.

## Retained application and provider dependencies

| Path | Current source behavior | Why it remains relevant |
| --- | --- | --- |
| `/coach`, `/v2` | [Coach aliases the V2 client](../../app/coach/page.tsx); [the client](../../app/v2/page.tsx) calls [agent processing](../../app/api/agent/process/route.ts) | Embedded classification and domain agents still use models. Target external authorship has not retired this path. |
| `/query`, `/api/query` | [The page redirects to Coach](../../app/query/page.tsx); [the separate endpoint](../../app/api/query/route.ts) remains model-backed | Its cross-domain [fetcher](../../app/api/query/lib/domain-fetchers.ts) and [formatter](../../app/api/query/lib/response-generator.ts) use workout/nutrition data. No WHOOP query helper remains. External endpoint use is not established by the cleanup. |
| Workout/meal entry | [Workout parsing](../../app/api/parse-workout/route.ts) and [shared meal-photo analysis](../../app/lib/nutrition/meal-photo-analysis.ts) use the LLM seam | Interpretation/extraction may still be needed independently of chat. |
| Screening and voice | [Photo screening](../../app/lib/nutrition/photo-screening.ts) and [audio transcription](../../app/api/transcribe-audio/route.ts) call OpenAI directly | Not every provider call goes through the shared seam. |
| Dashboard | [Facts store](../../app/lib/dashboard-narrative-store.ts) and [narrative service](../../app/lib/dashboard-narrative-service.ts) separate factual content from cached optional model prose | Narrative is an active feature, not proven unused code. |
| Program | [Program page](../../app/program/page.tsx) uses the [rolling Program client](../../app/program/rolling-program-page.tsx) and existing coach lifecycle | Accepted plan content, rationale, versions and completion links must survive the transition. |
| WHOOP | Existing [integration services](../../app/lib/whoop) and [metrics component](../../app/components/whoop/WhoopMetricsCard.tsx) | Removing the orphan query helper did not retire the integration. |
| Export | [CSV/PDF endpoint](../../app/api/export/route.ts) exports workout/meal views | This is not a lossless export of every context, plan and revision domain. |

The [LLM seam](../../app/lib/llm/client.ts) routes by purpose to Anthropic or
OpenAI. [package.json](../../package.json) still includes both provider SDKs,
Next.js 15, React 19, Supabase libraries, Vitest and Playwright; Node.js 24.x is
required. Dependency presence is not a reason to remove an active caller.

The legacy [Sheets helpers](../../app/lib/sheets) are separate from the canonical
adaptive-program state described in
[ADR-0003](../decisions/ADR-0003-adaptive-coach-state-and-authority.md).
ADR-0039 supersedes that older ADR's programming-authorship target; historical
storage, acceptance and immutability contracts still matter.

## Unfinished transition and gated work

The eight-tool surface is not a complete external authoring/workflow product.
The existing [activity-operation contract's next slices](../decisions/ADR-0044-chatgpt-activity-record-operations.md#next-bounded-slices)
cover requirements/goals, selected-LLM plan persistence and acceptance,
assessments, nutrition goals/incomplete data, discovery/paging and legacy-format
corrections. Context coverage can be partial; an absent record does not establish
that an activity did not occur.

The [server policy](../../app/lib/personalized-coaching-capabilities.ts) keeps
`initialDosePolicy` false. That does not disable every legacy planner or authorize
a different numerical policy. The
[nutrition-photo pilot](../../app/lib/nutrition/photo-pilot-policy.ts) is also
hard-disabled in source. The
[external estimate receiver](../../app/api/capture/external-estimates/route.ts)
has its own default-off gate and capability; the
[handoff ADR](../decisions/ADR-0043-external-nutrition-estimate-handoff.md) records
separate hosted/device qualification. None is enabled by this overview.

The current MCP server advertises tool capabilities. Its source does not
establish successful visual plugin rendering, a qualified second client,
complete fresh-chat continuity or retirement of embedded authoring. These remain
distinct product/qualification questions.

Use the existing [chosen-LLM transition plan](../plans/socius-durable-context-goal-2026-10-19.md)
for ordered work. Its checkpoint tables are dated observations, not live
configuration readback; this overview adds no competing roadmap.

## Evidence and operating limits

Keep these claims separate:

| Claim | Required evidence |
| --- | --- |
| Target architecture | Accepted decision and product contract |
| Source implementation | Exact revision, callers, gates and tests relevant to the claim |
| Hosted rollout | Exact deployment source/target, installed schema and configuration |
| Product acceptance | Actual authorized owner/client workflow and useful truthful readback |

The [verification receipts](../verification/llm-coaching-context) describe bounded
dated checks. Their existence is not today's alias, refresh/revocation lifecycle,
coverage or athlete-outcome proof. A GitHub deployment status does not by itself
verify the provider's immutable source/alias mapping or application health.

No current latency benchmark, monetary saving, free-tier entitlement or
production-readiness guarantee is asserted here. Retained successful software
checks do not establish training efficacy. Use [repository instructions](../../AGENTS.md)
and the [CI workflow](../../.github/workflows/ci.yml) for change verification;
release, database, permissions and activation actions retain their own authority.
