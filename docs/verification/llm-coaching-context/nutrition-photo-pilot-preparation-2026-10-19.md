# Owner nutrition photo pilot preparation — 2026-10-19

This candidate prepares the approved selected-photo/OpenAI workflow locally. It
does not activate it. Software tests do not establish macro accuracy, complete
intake coverage, athletic outcomes, production availability or a dollar cap.

## Scope and acceptance source

Greg approved a small pilot: selected photo → private retained derivative →
OpenAI screening and bounded extraction → automatically saved, labelled
unreviewed estimated meal → optional later refinement in the chosen LLM. The
selected LLM retains synthesis/programming authority. Native Photos discovery,
background jobs, notifications and the proposed 7:30 PM review are excluded.

Baseline: `c11e5a1eb9f373273d68b6f8cfe8acd2f0e1143c`. Isolated branch:
`codex/nutrition-photo-owner-pilot`. Existing worktrees and their dirt are untouched.
Tracking: `Fitness-Tracker-xrz.6.1`; this pilot crosses parts of nutrition read,
controlled correction and photo capture slices, and does not complete the parent
read-only nutrition slice or overall transition.

Lead/builder: main Codex execution. Independent oracle: `/root/nutrition_oracle`,
baseline-only packet, no candidate exposure. Review and reproduced verification
use a separate execution that did not author code/tests. One review, one builder
response and one evidence-based resolution is the critique allowance.

The oracle's requirement-derived checks are: owner/RLS boundaries; default-off
admission; decoded bounded images; OpenAI-only dispatch; no inference of
consumption; deterministic item totals; immutable original estimate and field
origins; stable request replay and duplicate-image conflicts; transport ambiguity
without paid redispatch; revision races/replay; bounded source coverage; and
inert untrusted image/food text. Storage HTTP behavior and actual host/tool
attachment require separate runtime proof.

## Prepared behavior

- `/capture/nutrition-pilot` is a capture utility, not another coaching chat.
  Its code gate is literally false. It has no navigation promotion.
- `/api/meals/photo-pilot` bounds the multipart stream and decoded pixels;
  strips metadata into a JPEG derivative; resolves the owner from existing Auth;
  requires selected-photo/OpenAI/autolog consent and an expected-account match.
- `nutrition_photo_captures` derives its private object key server-side and
  persists stage markers before provider calls. Exact retries do not repeat
  screening or estimation. Same ID/different input and new ID/same submitted
  image or identical normalized derivative conflict explicitly; metadata changes
  cannot bypass that comparison. Distinct intended eating events require explicit
  logging, rather than silent deduplication into one event.
- At most one Decisions screening attempt and one vision estimate attempt are
  admitted for a capture. Nonfood/uncertain screening creates no meal. Provider
  failure/lost responses leave uncertain state and no blind redispatch. A
  persisted estimate may resume its atomic database commit safely.
- The evidence analyzer requires a completed, non-refused OpenAI response even
  when incomplete/refused output happens to contain valid-looking JSON. Existing
  legacy analyzer callers retain their prior parser behavior.
- GET status stays read-only. A bounded owner-bound PATCH and utility recovery
  button can finish only an already persisted estimate, without another image,
  screen or estimate request; saved receipts replay idempotently.
- Existing capture operations create one canonical meal with occurrence and all
  inferred fields `model_estimated/unreviewed`, `needs_review=true`, no review
  timestamp, and totals recomputed from validated items. The photo reference stays
  in the capture ledger; legacy `meals.photo_url` remains null.
- Original estimate, actual provider/model/usage, screening model/policy,
  hashes, normalization/parser versions, supplied context and distinct source,
  receipt, attempt, estimate and save timestamps remain in the ledger. Confidence
  is uncalibrated. Source text and optional context never confer tool authority.
- Prepared `get_nutrition_context` and `correct_estimated_meal` adapters use the
  existing verified request-local principal and owner client. They are deliberately
  **not registered** in production MCP. Read windows are explicit offset-bearing
  instants, maximum seven days/end exclusive, 50 rows/source and 128 KB response.
  Reads distinguish missing, unavailable, truncated and detected source changes;
  intake completeness stays unknown. Current targets are not target history.
- Corrections use existing immutable revisions, expected revision, stable mutation
  keys and deterministic totals. They preserve original estimate and uncertain
  occurrence. No arbitrary SQL, host-tool dispatcher or service-role fallback is
  added.

## Exact activation gates and release changes

1. **Private retention; no unattended permanent deletion.** Retain the normalized
   private derivative for later review. The earlier seven-day/24-hour purge
   proposal is superseded: there is no automatic permanent deletion and no new
   cleanup job in this scope. Permanent deletion requires action-specific owner
   confirmation when the action is taken. Recoverable deletion or retention
   cleanup may be separately designed and approved. Before activation qualify
   owner isolation, private photo access, storage-loss/uncertain-upload recovery
   and clear retention consent. Do not reuse the dormant helper's 30-day expiry
   or alter existing cleanup jobs. Original submitted bytes remain transient;
   only the normalized derivative would be retained.
2. **Schema/release — pending.** The exact prepared SQL is
   `docs/migrations/nutrition-photo-owner-pilot.sql`, outside the migration runner.
   It creates one owner SELECT/RLS table and one authenticated, owner-filtered,
   SECURITY DEFINER transition function with empty search_path and a second
   literal false gate. It reuses existing logging/freeze/commit/revision functions.
   It must not be applied yet. Implement the approved privacy and spending controls
   first, independently review the final SQL, inspect deployed function versions,
   then request exact migration/release authority. Application activation requires
   an explicit reviewed code change, host tool registration and end-to-end proof.
3. **Existing storage permission suitability — partly established, no expansion.**
   Metadata-only read on 2026-10-19 confirms `meal-photos` is private and accepts
   JPEG/PNG; existing authenticated policies constrain every object operation to
   bucket `meal-photos`, first folder `meals`, second folder `auth.uid()`. The
   prepared key is `meals/<owner>/nutrition-pilot/<capture-id>.jpg`, reusing that
   boundary. No policy, bucket, grant or object was changed. The owner already has
   UPDATE/DELETE rights: stored hashes do not make object bytes tamper-proof.
   Authenticated owner credentials can also write owned data directly; the RPC
   validates a claimed estimate, not a provider-signed attestation. Actual Storage
   API/RLS and private-image read/deletion behavior still need approved runtime
   proof. No image bytes/object listing were fetched.
4. **Credential reuse and data controls — pending.** A no-output process check
   found `OPENAI_API_KEY` present, without reading its value or sending a request.
   Presence is not validation of billing project, scopes, data retention, eligible
   ZDR, available models or permission to reuse it. Reuse of that existing key
   needs an explicit decision; new keys/persistent access are prohibited. The
   existing sensitive Vercel `OPENAI_API_KEY` metadata was separately confirmed
   for `gregs-projects-98860c8b/fitness-tracker`, covering Production and Preview.
   Reuse would be in place at that server-side destination, without copying a
   secret to this worktree. Its value was not read or compared to the process key.
   Await the pending reuse/model/budget decision before any live provider call.
   The estimator requests `store:false`, which does not establish zero abuse-log
   retention. Confirm OpenAI project/data controls before a real photo is sent.
5. **Paid calls and spending bounds — pending.** No provider HTTP response or live
   billing proof was obtained; the independent review's failed-DNS mock incident
   is disclosed below. Public docs checked 2026-10-19: Decisions with GPT-6 Luna costs
   $0.10 per million input tokens, with no output/cache charge; GPT-5.6 Luna
   Responses costs $0.20 input/$1.20 output per million tokens. A 1200² image uses
   at most 38×38 patches; the documented 1.2 multiplier gives 1,733 image tokens
   for GPT-5.6 Luna. Rates, availability and actual usage must be checked again at
   activation; provider environment overrides are currently still possible.

   Planning example, **not a hard bound**: assume 3,000 screening input tokens,
   5,000 estimation input tokens and the full 1,024 output-token ceiling. Cost is
   $0.00030 + $0.00100 + $0.0012288 = **$0.0025288 per qualified photo**, about
   **$0.76 for 300 photos**. Nonfood/rejected photos incur screening only. Storage,
   bandwidth, database/hosting, regional premiums and existing traffic are excluded.
   This is a conservative illustrative token scenario, not measured utilization.

   Proposed pilot approval bounds: **$1 in any rolling 24 hours, $5 total for an initial 30-day pilot,
   at most 10 captures/rolling 24 hours and one attempt/stage**. Before paid
   activation pin approved models/rates, calculate a documented worst-case cost
   from actual request/token limits, atomically reserve that full exposure before
   every dispatch across all instances, count uncertain calls as fully spent,
   refuse calls when the reserve would exceed either allowance, and independently
   test races/replays/unknown receipts. Existing 10-capture SQL admission and SDK
   retry/output limits are not a dollar cap. A shared existing API key's other
   traffic is outside a pilot-only ledger; do not claim an account-wide hard cap.

Public sources: [Decisions pricing](https://developers.openai.com/api/docs/guides/decisions),
[GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
[vision token rules](https://developers.openai.com/api/docs/guides/images-vision).

## Evidence limits

Synthetic PGlite exercises actual SQL transitions, RLS, existing canonical writes
and correction revisions. Fake transports replace Storage and OpenAI HTTP; sharp
decodes generated pixels. UI checks use jsdom. These do not qualify production
Auth/PostgREST/Storage, the chosen harness connection, real food accuracy, physical
phone capture or provider billing controls. No migration, live photo/provider
call, permission/credential change, push, merge, deployment, job or notification
is authorized by these tests. WHOOP ordinary-sync proof remains a separate pending
acceptance item; nutrition work does not resolve it.

The inactive preparation PR workflow is separately authorized through normal
required CI, review/mobile checks and protected merge, provided the literal false
gates, unapplied SQL and unregistered tools remain intact. This allows a normal
hosted deployment to remain inactive; it does not authorize schema application,
provider calls, activation, unattended permanent deletion or a new cleanup job.

Independent review identified and the builder addressed three P2 findings:
normalized-image deduplication, incomplete/refused response rejection, and an
explicit database-only completion path after a proven precommit failure.
During an initial temporary adversarial probe, a review mock resolved incorrectly
and the real SDK attempted DNS resolution for api.openai.com using a synthetic
test key. DNS failed with ENOTFOUND before any HTTP response; this was a harness
error, not live-provider verification. The reviewer then used an inert exact
SDK alias plus a fetch tripwire before loading the probe. The failure and amended
candidate verification remain in the independent receipt outside this repository.
