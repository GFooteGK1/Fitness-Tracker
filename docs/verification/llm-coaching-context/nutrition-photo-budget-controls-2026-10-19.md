# Inactive owner photo pilot: approved budget controls, 2026-10-19

## Scope and authority

Greg approved existing server-side OpenAI key reuse in place, gpt-6-luna screening,
gpt-5.6-luna estimation, no fallback, $1 per rolling 24 hours and $5 total during
one initial 30-day period. This covers this pilot's requests, not unrelated use
of the shared key. Photos remain private for later review. No automatic permanent
deletion, cleanup job, new key, exported secret, wider permission or paid probe.
Production activation and the exact migration still require final approval.

PR100 is the separately reviewed inactive preparation. This slice adds accounting
and dispatch controls only. Both literal false gates remain false; the SQL remains
outside supabase/migrations; external nutrition tools remain unregistered.

## Frozen acceptance and accounting meaning

Before each paid stage, one database transaction under the existing owner advisory
lock must insert its full conservative exposure and change capture state. Exposure
plus the requested stage must not exceed 1,000,000 microUSD in the rolling window
or 5,000,000 microUSD over the fixed policy period. Equality is allowed. A failed
transition rolls back both writes. Duplicate stages cannot obtain another grant.

The migration creates exactly one policy period using database time, with a
720-hour interval. Missing/ended/future periods fail closed. Redeploys, new capture
IDs, deleted photos/meals, ordinary retries, process restarts and model/environment
overrides cannot create a new period or refund exposure. No owner/anonymous table
write, truncate, reset, replacement-policy or refund API is provided. The ledger
has no deletion cascade. Administrators can change SQL/data and remain outside
application enforcement; no permission expansion is part of this slice.

An acknowledged start returns a stage/model/capture/policy-bound execution-local
grant. The provider call must begin within ten monotonic seconds of starting the
RPC and with at least 45 seconds left in the period. SQL refuses admissions with
less than 60 seconds remaining. The synchronous guard is one-use, immediately
before provider dispatch. Lost/malformed/late acknowledgements cause zero dispatch;
possible committed reservations remain counted. There is no asynchronous worker,
provider fallback or retry. An already admitted call may finish after period end;
this is a stop on new calls, not a guarantee that the provider aborts remote work.

Successful result acknowledgement records database completion time. Rolling
exposure ages out only 24 hours plus 60 seconds after that acknowledgement.
Unsettled exposure never ages out during the pilot, including timeouts, refusals,
429/5xx responses, missing usage, crashes and lost save responses. No reservation
is refunded from the initial-period total, including cheaply completed calls.
Status/correction/database-only recovery cannot confer dispatch authority.

## Dated conservative cost proof (conditional on hosted qualification)

No illustrative average token count is used for admission. Each request reserves
against the entire documented 1,050,000-token model context, even though normalized
photos are at most 1200 by 1200 and the context text is at most 1000 characters.
This avoids assuming GPT-5.6 image multipliers also describe GPT-6 Decisions.

Screening reserve: 250,000 microUSD ($0.25). Decisions pricing is $0.10 per million
input tokens, no cache/output charge. Full context, long-context 2x and regional
1.1x give 1.05 * 0.10 * 2 * 1.1 = $0.231, rounded upward to $0.25.

Estimation reserve: 600,000 microUSD ($0.60). Full-context input at $0.20 per million,
2x long-context, conservative 1.25x cache-write and 1.1x regional factors costs
$0.5775. The fixed 1,024 output-token limit includes reasoning; at $1.20 per
million, 1.5x long-context and 1.1x regional, output is $0.00202752. Combined
$0.57952752 rounds upward to $0.60. The pilot explicitly selects the standard
Responses tier and fixed OpenAI endpoint. No tools, extra generation, background
mode or continuation are requested. The unrelated legacy routes keep defaults.

One complete successful capture reserves $0.85, so conservative accounting admits
at most five complete captures over the initial period; screening-only attempts
consume $0.25 each. This trades throughput for a defensible bound. It is not an
actual invoice prediction or evidence of food-estimation accuracy. Improving
utilization requires separately validated smaller request-token bounds and review.
No automated actual-cost refund is implemented.

Sources checked 2026-10-19:
- https://developers.openai.com/api/docs/guides/decisions
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://developers.openai.com/api/reference/python/resources/beta/subresources/responses/methods/create

These published assumptions must be requalified against the existing hosted key,
project/tier/region and supported request contract immediately before activation.
A provider changing prices/limits cannot be controlled by a local SQL ledger;
activation must remain blocked if the upper bound is not established. No claim
of account-wide billing enforcement or provider-side hard limits is made.

## Practical capacity: activation is not recommended for this candidate

The conservative no-refund implementation admits **one full photo estimate per
rolling 24-hour exposure window, at most five across all 30 days**. The extra
60-second completion margin may move the next eligible time slightly later than
24 hours. Four screening-only attempts use the daily allowance. These are maximum
successful capacities; unresolved attempts can reduce them further. This does
**not** satisfy daily food tracking. Do not activate merely because accounting
tests pass; the budget must remain $1/$5 and uncertain exposure must remain fully
reserved.

Two tighter approaches were investigated using primary docs and current code:

1. Exact pre-dispatch token counting is documented for Responses, including images
   and formatting overhead, using the **same Responses request payload**. That
   could tighten estimation admission once hosted endpoint access and any count
   charge are qualified. It does not document an equivalent count for Decisions
   questions, and the current image multiplier table does not establish GPT-6
   Decisions sizing. A guessed character/token ratio or applying GPT-5.6 image
   rules to GPT-6 cannot prove a smaller screening reserve. No count request or
   photo was sent, and no unqualified smaller ceiling was implemented.
2. **Recommended next bounded change: trusted settlement of confirmed usage.**
   Decisions has a documented response usage.input_tokens field. Responses also
   supplies input/output usage. The existing generic adapter defaults missing
   usage to zero; that must never authorize a refund. Keep the full reservation
   until a server-authenticated provider response has exact model, valid complete
   usage and qualified billing categories. Calculate a conservative integer
   microUSD charge with upward rounding and retain the original reserve as audit
   evidence. Unknown, malformed, failed, timed-out, missing-usage and lost receipts
   keep the full reserve. Only confirmed excess reservation can be released.

   Ordinary owner-authenticated nutrition_photo_pilot RPC callers can supply
   result payloads directly; they cannot be trusted to assert cost for a refund.
   The existing createServiceRoleClient + service-only validated RPC pattern used
   by reviewed-proposal services offers a possible trusted server boundary. A
   narrowly scoped settlement function would need to deny authenticated/anon,
   bind owner/capture/stage/reservation/provider evidence, atomically record one
   idempotent settlement under the same lock, reject conflicts and preserve
   unresolved exposure. No new credentials or broader role capability is needed
   as a design goal; exact privilege/default-grant suitability must be verified.
   This is a follow-up proposal, **not implemented or independently verified**.

Conditional capacity illustration for that settlement design: if each confirmed
screen reports 3,000 input tokens and each estimate reports 5,000 input plus 1,024
output tokens, charging even the conservative 2x long-context, regional and
cache-write multipliers above yields screen 660 microUSD and estimate 4,778
microUSD after upward rounding: **$0.005438/photo**. The existing admission limit
would permit **10 photos/rolling day, 300 over 30 days**; settled charges would be
$1.6314 total. Even with the next full $0.60 estimation reserve held, the tenth
call's daily exposure would be $0.649602 and the 300th's total exposure $2.226622.
This is arithmetic for specified confirmed token counts, not measured utilization,
a guaranteed rate or implementation evidence. Larger confirmed requests and
uncertain reservations reduce capacity; e.g. one unresolved full capture retains
$0.85 and blocks new paid stages for the rest of the pilot unless its true
outcome is separately reconciled; uncertainty never expires automatically. Qualified actual usage
must control admission rather than promising ten successful photos regardless
of cost. This path can plausibly support normal tracking without raising budgets,
but a trusted settlement implementation and independent tests remain necessary.

Additional sources:
- https://developers.openai.com/api/docs/guides/token-counting
- https://developers.openai.com/api/reference/resources/decisions/methods/create/

## Hosted qualification and exact pending release scope

Existing Vercel sensitive OPENAI_API_KEY metadata is confirmed for Preview and
Production on gregs-projects-98860c8b/fitness-tracker, project
prj_RocmjxStsTrtmrDaqMddMnb29ENh. No key value was read, exported, copied or compared
with a local process key. Public docs do not establish that credential's model
access, project billing, data controls or endpoint support. There is no existing
authenticated model-metadata diagnostic endpoint in this repository. An authorized
in-place remote execution path is therefore still needed; do not work around this
by pulling environment secrets or using the unqualified local key.

Only after practical capacity, hosted qualification and independent verification
are resolved, request exact approval for:
1. Applying the reviewed draft SQL once against the confirmed existing canonical
   capture functions; policy period starts at migration time. This creates three
   owner-scoped tables/policies plus the existing owner-filtered transition RPC.
2. Flipping only the two explicit literal activation gates, with the exact reviewed
   commit and migration hashes. No global LLM settings, jobs, storage policies,
   new credentials or permanent deletion.
3. Registering only the reviewed nutrition tools in the selected harness if that
   connection is authorized; this remains separate from a successful HTTP build.
4. One explicitly selected synthetic food photo canary under the qualified existing
   server-side key: one screening and, only for food, one estimation, with a full
   $0.85 reservation. Verify private owner isolation, durable estimate/provenance,
   no replay dispatch, budget receipts and correction revision. Real personal
   photos and more calls are not implied by tests or a deployment.

No such migration, gate change, registration, canary or paid request was run.

## Evidence limits

Focused tests exercise actual disposable PostgreSQL transitions/RLS and synthetic
image bytes with inert provider/Storage transports. PGlite queues queries in one
connection: competing Promise calls test uniqueness and replay behavior, not true
multi-session lock scheduling. No local PostgreSQL/docker executable was found;
multi-transaction concurrency proof remains a release qualification gap. Tests
must be independently reproduced and a relevant budget mutation detected before
claiming reviewed control behavior. Production pricing/access and Storage behavior
remain separate runtime checks. No athletic or nutrition outcomes follow from
passing software tests.
