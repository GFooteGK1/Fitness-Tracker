# Setup-freshness live lifecycle execution packet

Prepared for Fitness-Tracker-i40.15.1; execution has not been approved or run.
Application checkpoint: f8718aa5ac588ffef0cf41d66149daddd681494d, draft PR #86.
This harness extends that application checkpoint and is not covered by its
CI 36330119709. Publish and verify the final harness checkpoint before seeking
rollout approval; the canonical tracker records the resulting commit and CI run.

## Scope to approve after checkpoint and fresh preflight

Target only Supabase `auolnfwetmfcwhtvakzy` and the actual approved candidate at
`https://www.sociusfit.com`. Freeze the verified production deployment ID, source
SHA and current paused generation after the separately authorized migration and
deployment. The required migration is `20260926010000_coach_setup_memory_bindings`
with SHA256 `3db1bfa44acfe078af7a0278c8b65b78f92489368b9d19a7a31bc7e8e32c6527`.

The live-check authority must explicitly include securely supplying the existing
project anon/service keys and an approved Management API token; issuing one
temporary login with `POST /v1/projects/auolnfwetmfcwhtvakzy/cli/login-role`
and `{read_only:false}`; creating exactly two new synthetic Auth owners and their
owner-authenticated profiles; the fixed lifecycle requests and memory-expiry
fixtures; one bounded global reopen; committed re-pause; audits and stopping
only the run's exact labeled SQL clients. No account deletion or real-athlete
history repair is included. No paid JEV calls or numerical activation is included.

This login method deliberately does not invoke Supabase CLI connection setup:
the pinned CLI may rotate the temporary role and attempt network unbans. Do not
silently use that older transport for this run. Fresh release preflight and the
migration operator must also exclude unapproved network-setting changes.

The global coaching-write switch permits all athletes during the bounded check.
The worker has180 seconds, containment begins by185 seconds, and committed closed
state must be observed by210 seconds. Network failure can prevent that proof;
the attended operator must retain the failure and keep release acceptance closed.
Any non-synthetic audit difference requires investigation, never data restoration.

## Prepared commands, in the release checkout

These commands are for the later approved execution, not preparation-time probes.
The runner performs no migration, merge or deployment. It requires that the
approved candidate is already READY, its aliases agree, numerical capability is
disabled in that source, the exact migration ledger exists, and coaching is paused.
The broader release plan still owns fresh catalog/privilege/source-build checks.

1. Securely stream a JSON object to `node scripts/release/setup-freshness-live-hosted.mjs --prepare`.
   Fields: `candidateSha`, `deploymentId`, `pausedGeneration`, `anonKey`,
   `serviceRoleKey`, `managementAccessToken`. Never put keys in chat, shell
   arguments, a repository file or console output. This command makes no network
   calls; it creates an encrypted private manifest with exact new owner/request IDs.
   Capture only its returned run ID and manifest hash.
2. `node scripts/release/setup-freshness-live-hosted.mjs --provision <runId>`.
   Checks current deployment, paused generation and installed migration; obtains
   one shared temporary SQL login; provisions exactly those two owners and saves
   encrypted sessions. A failed/uncertain create cannot be retried with this run.
   The temporary role must have at least10 minutes initially and5 minutes remaining
   for each SQL client. Do not run another CLI login during this execution.
3. In execution sessionA, run
   `node scripts/release/setup-freshness-live-hosted.mjs --coordinator <runId>`.
   Wait for `waitingForIndependentGuardian:true`. It has created the baseline
   audit and a verified owner worker, but has not opened coaching writes.
4. In a separate execution sessionB, run
   `node scripts/release/setup-freshness-live-hosted.mjs --guardian <runId>`.
   Do not launch it as a child of sessionA. Its durable readiness permits the
   coordinator's single exact-generation reopen. It stops the worker and
   re-pauses after completion, failure, coordinator loss or deadline.
5. Require the encrypted `attended-result`, `guardian-result`, full44-step result,
   both accepted-history proofs, unchanged eight-table audit and stopped-client
   readbacks. A dispatch or console message alone does not establish success.
   Success leaves production coaching paused. Resuming normal coaching belongs
   to the separately approved release acceptance decision and fresh CAS readback.

On coordinator loss, the independent guardian contains writes and checks the
saved coordinator client before stopping it. Later use
`node scripts/release/setup-freshness-live-hosted.mjs --audit-recovery <runId>`
only for its explicitly included readback/cleanup scope. It verifies both process
identities are gone, takes a fresh exact-generation paused read and a new recovery
audit, and leaves coaching paused. It never resumes lifecycle requests. If the
shared credential expired or cleanup is uncertain, stop for attended operator
recovery; do not rotate a credential or repeat a mutation automatically.
If the coordinator dies after the guardian has exited, the recovery command is
still required for client cleanup. Do not infer stopped-client proof from the
earlier containment receipt.

## Evidence and limits

Local full lifecycle: `1b154f5f-5dbe-43c2-b03a-0abf8a6e8e39`, all 44 steps,
independent containment, global history and accepted synthetic history passed.
Worker failure: `7b521ab4-1edf-4bfc-a64e-66b398ab0b85`, containment/audit passed.
Coordinator crash: `5f01564f-98ce-4244-9f26-443e3ec66f85`, independent containment,
post-crash audit and exact local restoration passed. The same crash receipt also
verified stopping a new credential-free/no-network orphan SQL-client fixture.
Shared provisioning: `91ea7bfb-6e79-4982-aa99-b6c9499e0a25`, two predefined owner
IDs, authenticated profiles, encrypted sessions and unchanged local switch passed.

73 focused tests, TypeScript and lint pass; lint retains the existing v2 hook
warning. Hosted login/API/SQL execution remains unverified. These local results
do not claim a successful production rollout or authority to begin one.
