# Proposed production cutover approval

**Preparation only; not yet approved or ready to execute.** Staging and bounded
hosted verification are complete. The remaining preparation below must produce
one reviewed execution sheet before Greg approves production installation,
pause/resume, promotion and synthetic writes. A dedicated automation script is
optional; a reproducible manual procedure using existing clients is sufficient.

## Pinned target and evidence

| Item | Required identity |
| --- | --- |
| Staged deployment | `dpl_2tZqnshTDrFR5EDQpgi78dcBNns7` |
| Application source | `93539b00bef9109f4221d10c9554cd99a3f5d5fe` |
| Deployment URL | `https://fitness-tracker-je2rwxwh4-gregs-projects-98860c8b.vercel.app` |
| Next build ID | `u93phgwCcXfUdAb5YKaBh` |
| Retained tar SHA256 | `461e0bf9e21561e0323c6c2edf53e825d48f8a8a8fc7c9f2a739798c8ea44814` |
| Vercel project / team | `prj_RocmjxStsTrtmrDaqMddMnb29ENh` / `team_zjdKVgrSBNAYC9gql0Raiocm` |
| Live domain | `www.sociusfit.com` |
| Supabase project / database | `auolnfwetmfcwhtvakzy` / `postgres` |

The [hosted receipt](production-hosted-checks-2026-09-23.json) records the exact
rendered build ID, nine matching script paths, two matching asset hashes and
signed-out `Unauthorized` bodies. Raw HTTP status was not exposed by the browser;
the inspected source returns 401. At 2026-09-24 00:29 UTC the live domain still
pointed to `dpl_5kZSaXHLmqPPzsCy6odLJyy99utW`, and all 31 environment bindings
were unchanged. CI `35937955529` passed for checkpoint `8080788`. These checks do
not prove authenticated coaching writes or grant cutover authority.

## Exact proposed authority

The eventual approval should name this deployment and database and authorize:
the two exact migrations below; generation-checked coaching pause/resume;
a fresh encrypted recovery capture; promotion of the pinned deployment;
one dedicated synthetic account and the bounded application checks below.
Preserve all runtime bindings, including the unread sensitive exercise-preference
flag. No new capability flag or numerical policy is activated. Existing WHOOP
cron behavior remains as disclosed in the approved staging packet.

Install **pause first**, despite filename order:

| Migration | SHA256 |
| --- | --- |
| `20260923010000_coaching_write_pause.sql` | `6c336015b78142da07a091d9f999d7019c13d9ec819064cfd4b82ee16d48a041` |
| `20260921010000_coach_proposal_context_revision.sql` | `0a2983e79dfbfc7dada724d3af80916b74b61f50e4e0ee32056e5b7dd694f58f` |

No broad database push, PR merge, new hosting project/cost, production restore,
account/data deletion, connection termination or automatic retry is included.
Do not restamp old drafts or rewrite accepted prescriptions.

## Proposed execution sequence

1. Recheck target identity, deployment readiness, domain mapping, required CI,
   environment bindings and migration ledger immediately before execution.
   Verify the existing `postgres` SUPERUSER/BYPASSRLS prerequisite without
   granting privileges. Record private digests of pre-existing accepted
   prescriptions before changing schema.
2. Install only the verified pause file using an error-stopping client. Both
   migrations own their transactions. Verify its singleton, six statement
   triggers, definitions, forced RLS and denied application-role privileges.
   Record successful installation in the migration ledger using the reviewed
   ledger procedure; do not mark a failed migration applied.
3. Follow the [operator procedure](coaching-write-pause-operator.md): read the
   current generation, request pause with that exact generation, require actual
   COMMIT and independent `paused=true` readback. A returned row before COMMIT
   is not proof of drain. Installation uses NOWAIT; pause has a five-second
   per-lock cap. Neither is a whole-request deadline or permission to retry.
4. Capture a fresh consistent encrypted backup under the committed pause using
   the existing recovery procedure. Require a completed authenticated manifest
   and archive identity. Retain the previously verified archive. The earlier
   93-table restore proves that archive and method, not this new capture; counts
   can change after installing the control table. The gate protects six coaching
   output tables and does not freeze unrelated database traffic.
5. Apply only the verified revision migration while paused. Verify its actual
   definitions, privileges and ledger entry, and recheck accepted-prescription
   digests. The existing release metadata classifier expects both new migrations
   absent; it cannot serve as the post-install verifier unchanged.
6. Promote only the pinned staged deployment. Verify the custom-domain target,
   build/asset identity and preserved environment bindings while still paused.
   Perform the controlled checks below, then record the final gate generation,
   deployment, results and accepted-prescription digests.

## Minimum production synthetic-write scope

Use **one new dedicated synthetic owner**, never Greg or another athlete. The
existing local flow exercises Auth Admin `createUser` with `email_confirm:true`,
one synthetic profile, normal password sign-in and the actual Next cookie
adapter. The proposed production procedure must retain those semantics without
email/invites, logging credentials or inserting directly into `auth.users`.
Account identity, password, cookies and raw row evidence stay private.

Freeze one complete synthetic intake, Monday start, future target date, timezone
and idempotency keys before execution. Use the already exercised bodyweight
strength intake with three training days and 60-minute sessions; verify its
exact compiler output and row count offline for the chosen dates. The success
path is one `POST /api/coach/weekly`, then one
`POST /api/coach/proposals/{id}/accept`, followed by replay of that same accept
request with the same key. Expected writes are one program, plan, proposal,
the compiler-produced prescribed sessions, the owner's context-revision row,
and necessary profile/Auth bookkeeping. Freeze any additional derived rows
found in the reviewed procedure before asking for approval.

Record the stored context revision and proposal input snapshot, acceptance IDs
and private digests of the accepted program/plan/session/proposal rows. Compare
digests **after first acceptance versus after replay**; activation itself is a
legitimate first-acceptance change. Retain the account and synthetic records;
deletion requires separate authority. No workouts, measurements, reviews, source
corrections, WHOOP connection or second account are needed for this narrow claim.
Production stale-source and cross-owner behavior remain untested by this smoke;
existing local evidence is separate.

The controlled gate sequence is:

1. While paused on the compatible app, attempt the synthetic initial proposal
   and verify maintenance rejection with no protected-table changes. The separate
   revision-read RPC can initialize the synthetic owner's revision row before
   the later proposal transaction is rejected; do not claim zero database writes.
2. Commit a generation-checked resume and independently read back open state.
   Execute the single successful create and first acceptance, with no automatic
   retries. Record IDs and accepted-row digests.
3. Immediately commit a generation-checked re-pause and independently verify it.
   Replay the accepted request while paused; require the same accepted identity
   and unchanged accepted-row digests. This demonstrates read-only replay rather
   than another successful write through the closed gate.
4. Resume finally only after every approved check passes, using a newly observed
   exact generation and successful COMMIT/readback. On failure, preserve or
   re-establish pause and stop. Failed/ambiguous re-pause must be reported as an
   unknown/open state, never as successful containment.

The gate is global, not synthetic-owner scoped. During the temporary resume,
real athletes can also write. The final execution sheet must fix the maintenance
window, operator, request deadlines and maximum open interval, with a separate
operator connection ready to re-pause. This packet does not claim those bounds
are already implemented or guarantee unrelated traffic is frozen.

## Required preparation before the approval request

- Specify the credential-safe operator/client procedure, exact migration-ledger
  transaction/order and post-install readback queries. Existing `psql` with
  `ON_ERROR_STOP` and the verified files can suffice; no new installer is required.
- Freeze the production account provisioning, cookie-authenticated API requests,
  exact intake/keys, expected row counts, private digest queries and failure
  handling. A reviewed manual/API procedure can suffice. The existing local
  scripts are deliberately loopback-only and must not be retargeted blindly.
- Record exact supported promotion and compatible recovery operations, the
  maintenance window/open-interval bounds and shared failed-attempt budget.
  Do not substitute the staging deployment command for promotion.
- State the fresh-backup acceptance boundary explicitly: a completed capture
  backed by the previously verified restore method, or an additional isolated
  restore of that fresh archive before migration. If the latter is required,
  include its runtime/locale prerequisites and bounded execution in the approval.

These are missing execution details, not a requirement to build more tooling.
No command in this packet is authority to execute them.

## Recovery boundary

The retained compatible floor `923473a` has the same application code as source
`93539b0`. It can address an artifact/deployment failure, not undo a shared code
defect. After revision installation, the old live `f123aa8` application is not a
safe rollback target. Keep both database guards installed and coaching paused
if compatible operation cannot be established; fix forward or obtain approval
for a separately identified compatible artifact. Database restoration is a
different, destructive action and is not authorized by this proposed cutover.

Source contracts and evidence: [release decision](production-release-decision-2026-09-23.md),
[pause operator](coaching-write-pause-operator.md),
[local pause/rollback](local-pause-and-rollback-2026-09-23.md),
`scripts/release/local-app-flow.mjs`, `scripts/release/private-production-recovery.mjs`,
`app/api/coach/weekly/route.ts`, and `app/api/coach/proposals/[id]/accept/route.ts`.
