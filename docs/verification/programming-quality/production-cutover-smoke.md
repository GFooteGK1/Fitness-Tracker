# Proposed synthetic application smoke

Preparation only. No production account, credential read, request or write was
performed for this procedure. Execute only after Greg approves the complete
[execution sheet](production-cutover-execution-2026-09-23.md), including this
account, the existing service-role retrieval, pause/resume and bounded writes.
The loopback `local-app-flow.mjs` remains loopback-only and must not be retargeted.

## Frozen inputs and scope

Use [the frozen input](production-cutover-smoke-input-2026-09-23.json), SHA256
`e72e277dd58eb8f27b5f4ff03e21517f68e424e539f9d5a1c6908aa13ecf5c66`.
Its proposed run identity is `342ef896-6dd9-4bb4-acbc-ebab7b7b0baf`.
The `.invalid` email in that file is a reserved synthetic identity, not an
existing account. Do not generate another identity or key after an uncertain
request. The password, returned Auth UUID, sessions, cookies and row evidence
belong only in the existing ACL-protected, encrypted private recovery directory.

The sole application base is `https://www.sociusfit.com`, after verification that
it serves `dpl_2tZqnshTDrFR5EDQpgi78dcBNns7` / source `93539b0` / build
`u93phgwCcXfUdAb5YKaBh`. The sole Auth/data API is
`https://auolnfwetmfcwhtvakzy.supabase.co`. Reject redirects and other hosts.
No Preview endpoint, user account other than the frozen synthetic identity,
second proposal, workout, observation, review or source correction is included.

The complete intake is supplied directly in `POST /api/coach/weekly`; **do not
also call POST `/api/coach/intake`**. That route would write coach memories and
change the revision/count contract. The input fixes bodyweight strength, three
60-minute sessions, Monday/Wednesday/Friday, start `2026-09-28`, target
`2027-04-05`, and raw timezone offset `300` (UTC−05:00). Do not convert it to
the agent offset convention. If execution moves beyond the start date, stop and
refresh inputs, compiler evidence and approval first.

All five new capability bindings must remain absent, as in the approved
artifact input. Preserve the existing exercise-preference binding. This new
owner has no preferences, memories or assessments; its empty preference context
does not introduce different movement selections. Do not submit confirmation
memories to satisfy an unexpectedly enabled training-intent flag.

Local compiler verification produced exactly three prescribed-session rows,
dated `2026-09-28`, `2026-09-30`, `2026-10-02`, indices 1–3, with window end
`2026-10-04`. Policy is `rolling-weekly-0.1.0`, evidence reference
`complete-programming-0.1.0`. The exact compiler intent/source-snapshot fingerprint
with empty assessments and context revision 0 is
`78029d250d42d4a520d59a19cb26e78afb1f3f5698df8f7fbd30e513b2d3a2ab`.
This freezes existing compiler output; it is not a coaching-policy evaluation.

## Credential and account procedure after approval

Before opening the gate, use the existing official Supabase CLI login to run
one `projects api-keys --project-ref auolnfwetmfcwhtvakzy --output json` request.
Invoke the pinned CLI as a child process with stdout/stderr captured in memory,
15-second deadline, no debug output and no shell interpolation. Do not run the
command directly in a displayed terminal. Select exactly one existing legacy
`service_role` entry. Verify its JWT claims identify this project and role;
compare the returned legacy anon key with the frozen public input hash. Abort
if the response is ambiguous, redacted or unexpected. Do not mint a key, rotate
one, reveal all modern secret keys or scrape the CLI credential store. Raw
diagnostics, if retained, must use the existing encrypted private-file helper.
The official [CLI reference](https://supabase.com/docs/reference/cli/supabase-projects-api-keys)
documents this command and the existing login's Management API access.

Use the installed `@supabase/supabase-js` client, with `persistSession:false`,
`autoRefreshToken:false`, and a scoped fetch enforcing the fixed API origin and
15-second request deadline. Keep the existing service-role value only in the
private operator process; never put it in a browser, application build or source.
It is used only for Auth Admin and this synthetic owner's profile bookkeeping.

1. Generate one cryptographically random password in memory and seal it with
   the frozen identity before the request. Call
   `admin.auth.admin.createUser({email, password, email_confirm:true})` once.
   Do not call signup, invite or email APIs; do not insert directly into
   `auth.users`. Require returned email/UUID to match the intended new identity.
   Collision, failure or timeout is a stop; do not create a substitute account.
2. Upsert exactly one `user_profiles` row on `user_id` using the returned UUID
   and the frozen `profile` object. Require one resulting owned profile and no
   other profile IDs. A failure is reconciled while paused, without retry.
3. With the frozen public anon key, call `signInWithPassword({email,password})`
   once. Require returned user UUID equality. Disable automatic token refresh.
   Auth may update its managed login/session/audit records; those are not claimed
   immutable or included in the coaching row counts below. Record their observed
   counts privately after sign-in; no extra account or provider connection is
   allowed. Provisioning writes one Auth user, its provider-owned email identity and
   session bookkeeping, and one profile, in addition to the exact coaching rows.
4. Build the cookie using the installed `CookieAuthStorageAdapter`, as in the
   local flow. Its key is **`sb-auolnfwetmfcwhtvakzy-auth-token`**, not the local
   `sb-127-auth-token`. Call `setItem(key, JSON.stringify(session))`; collect
   every `setCookie(name,value)` result as `name=encodeURIComponent(value)` and
   join with `; `. This preserves the adapter's chunking. Keep the cookie private.
5. GET `/api/coach/weekly` with that Cookie; require HTTP 200 and `program:null`.
   Verify the owner has zero rows in the six protected tables, no revision row,
   no coach memories, assessments, workouts, check-ins or observations. If not,
   stop. Do not clear records to manufacture a clean account.

Managed Auth bookkeeping is recorded, not assigned invented exact table counts.
If provider triggers introduce any other application row, stop and expand the
reviewed expected-row contract before the temporary resume.

## Application sequence and bounds

An application request uses `Content-Type: application/json`, the private Cookie,
the exact frozen body, `redirect:'error'`, and `AbortSignal.timeout(15000)`.
Accept only the specified status and parsed body. No automatic retry. An abort
does not prove the server stopped or rolled back. Persist response IDs privately
before the next request; suppress bodies and cookies in console output.

Before the temporary resume, arm a separate operator connection with the reviewed
[pause procedure](coaching-write-pause-operator.md). Every gate change uses its
newly observed exact generation, an explicit transaction, successful COMMIT and
independent readback of the requested state and generation+1. The helper's
five-second per-lock timeout is not a whole-operation deadline.

| Stage | Request/action | Required result |
| --- | --- | --- |
| Closed-gate baseline | Confirm committed paused state; save private owner counts/digests | Six output counts 0; revision count 0 |
| Deliberate rejection | POST frozen create body once while paused | HTTP 503, exactly `{"error":"Unable to save the first weekly proposal"}`; six outputs still 0; revision row exists at 0 |
| Open | Operator resumes with current generation and verifies committed open state | Record monotonic start time; all other production users can also write during this interval |
| Create | POST the **same** frozen create body/key once | HTTP 201; `acceptanceRequired:true`, `activePlanChanged:false`; capture proposal/program/plan IDs and exact returned key |
| First accept | POST `/api/coach/proposals/{proposalId}/accept` with frozen `acceptanceBody` once | HTTP 200; `accepted` contains the same program ID, active plan ID and `proposal_status:'accepted'` |
| Close immediately | Operator re-pauses on acceptance success, any error or uncertain result | Successful COMMIT plus independent `paused:true` / next-generation readback |
| Accepted baseline | Save owner counts, state and full-row digests after first acceptance, while paused | One active program, accepted plan/proposal, three prescribed sessions, zero reviews/links, revision 0 |
| Replay | Repeat the same accept URL and identical key once, still paused | HTTP 200; identical `accepted` object; all seven owner row-count/digest pairs unchanged |
| Finish | Compare existing-athlete immutable baselines; root applies final approval gates | Final resume only after every required check passes; fresh generation/COMMIT/readback |

Create plus first accept has a 30-second operational target. Begin re-pause
immediately after acceptance/error and **no later than 60 seconds** after the
committed-open readback. Target confirmed closed by 90 seconds. These are operator
deadlines, not a guarantee when a control connection fails. Stop application
requests once closing begins; a separate ready operator must handle containment.
The total maintenance soft limit is **45 minutes**, including the fresh recovery
capture and private restore from the execution sheet. No deadline auto-resumes.

The deliberate expected 503 is not a failed remedy. Any unexpected status,
timeout, count, digest or identity consumes the shared failure budget in the
execution sheet; stop the smoke rather than spending retries independently.
If create/accept is uncertain, re-pause first, then read once by frozen owner/key
with the private state query. Record whether committed; do not automatically
accept a discovered pending proposal or repeat an uncertain write. A failed or
ambiguous re-pause is **unknown/open containment**, not success. After revision
installation, never fall back to the old unstamped application.

## Exact owned row evidence

`cutover-smoke-contract.mjs` exports `CUTOVER_SMOKE_DIGEST_SQL` and
`CUTOVER_SMOKE_STATE_SQL`; both take one bound `$1` UUID. Use the approved
operator connection, not the synthetic cookie/client, for these private reads.
Within an explicit `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, execute
`CUTOVER_SMOKE_READ_SETTINGS`, then the queries, then `ROLLBACK`. Settings are
`ROLE postgres`, `row_security=off`, 10-second statement/1-second lock bounds,
UTC, `ISO,YMD`, ISO intervals, hex bytea, float precision 3 and
`search_path=pg_catalog`. They match the existing recovery canonical settings.
For SQL Editor, replace only `$1` with the privately recorded UUID as a SQL-quoted
UUID literal after strict UUID validation; never put credentials in SQL text.

The digest returns relation/count/SHA256 only. It hashes full owned rows with
sorted row hashes, including IDs, snapshots and timestamps. Run the same settings
for every comparison; otherwise timestamp formatting can create false differences.
Raw state query results contain IDs/key and remain encrypted/private.

| Table | After rejected create | After acceptance and replay |
| --- | ---: | ---: |
| training_programs | 0 | 1 |
| training_plan_versions | 0 | 1 |
| prescribed_sessions | 0 | 3 |
| adaptation_proposals | 0 | 1 |
| coach_weekly_reviews | 0 | 0 |
| coach_weekly_review_observations | 0 | 0 |
| coach_context_revisions | 1 | 1 |

Require stored input fingerprint to match the frozen compiler fingerprint,
snapshot `contextRevision` and current revision both 0, exact owner/IDs/key,
and all three session dates. Acceptance legitimately changes statuses and
timestamps: compare **after first acceptance versus after replay**, not draft
versus accepted. Keep the pre-existing accepted-version baseline separate; other
athletes may legitimately create new rows during the open interval.

## Fixed pre-existing accepted-plan invariant

After the first committed pause and before revision installation, run
`CUTOVER_ACCEPTED_PLAN_IDS_SQL` once under the same canonical read-only operator
settings. It selects IDs whose status is accepted or superseded. Freeze that exact
UUID list privately, including an explicit count if the set is empty. In the same
snapshot, bind that array to `CUTOVER_ACCEPTED_PLAN_DIGEST_SQL` and retain its
per-ID hash baseline. Never reselect a dynamic accepted-only set for comparison.

After revision installation and after the temporary open interval's committed
re-pause, run the digest query with the **original** array and canonical settings.
Require the same number of unique IDs, `present:true` for every one, and exact
per-ID SHA256 equality. `cutoverAcceptedPlanDigestsMatch` performs this comparison;
a missing ID produces an explicit null hash and fails. New athlete versions
created during the open interval do not join or replace this fixed baseline.

The projection includes exactly `id`, `program_id`, `user_id`, `version`,
`reference_version`, `policy_version`, `intent`, `input_snapshot`, `created_by`,
`created_at`, `plan_mode`, `window_start`, `window_end` and `sequence_number`.
These are identity plus the fields protected by
`protect_training_plan_version_content` at migration lines 266–290. It excludes
mutable status and acceptance/update timestamps, so legitimate superseding is
not mistaken for rewritten prescription content. This is the plan-version
invariant; the synthetic owner's full-row digest remains a separate, stronger
after-acceptance/replay comparison. Keep both baseline types private.

## Local evidence and limits

`scripts/release/cutover-smoke.test.ts` passes three focused tests. It compiles the
actual fixed intake and executes actual prerequisite, pause and revision SQL in
PGlite: rejected initial create, revision-read side effect, successful initial
create/accept, re-pause, same-key replay, exact counts and full-row digest equality.
Its Auth table is a synthetic fixture, not production provisioning; it proves
neither actual HTTP/cookie delivery nor multi-session drain behavior.
The third test executes the fixed-ID query, allows status-only supersession,
detects changed intent and a missing row, and rolls back its privileged local
negative controls. Trigger bypass and deletion exist only inside that rolled-back
PGlite fixture; neither is an operator step or authorized production action.

The replay basis is `20260903150000_rolling_weekly_coach.sql:948`: after owner/key
validation and row locks, the accepted branch returns before any UPDATE. The
pause migration guards INSERT/UPDATE/DELETE/TRUNCATE, not those SELECT locks.
The revision migration keeps that function body and adds a lock timeout. The
accept HTTP route calls that RPC and reads context afterward. Read-only context
may differ; compare the `accepted` object and stored digests, not the entire HTTP
context response. Never treat another key or non-active old proposal as this replay.

One local test iteration failed because canonical `row_security=off` was run
as the authenticated fixture actor. It correctly refused a protected-table read.
The fixture was corrected to use transaction-local `ROLE postgres` for private
digests, matching this operator procedure. A second test iteration false-failed
its final post-rollback digest because that read omitted canonical settings; the
same canonical transaction corrected it. All three tests then passed. A CLI help
inspection was also blocked by a local telemetry-file ACL before help ran; no
credential or production request occurred. Neither was a production attempt.
