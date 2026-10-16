# Supervised pilot release and recovery preparation

October 3, 2026. Canonical task: Fitness-Tracker-i40.17.5. This is a local
preparation artifact. The milestone and release gates remain open. No command in
this document authorizes a hosted query, migration, deployment or enrollment.

## Current artifact and scope

Selected snapshot79450bda-d990-4acd-9716-6ed433da2328 is independently qualified
locally:10 Node tests,4,606 regression tests/36 skips, full typecheck/lint/build.
All1,521 source files and dependency lock remained unchanged. It includes370
explicit overlays and preserves732 deferred paths. See
[supervised-release-selection-2026-10-03.md](supervised-release-selection-2026-10-03.md)
for hashes, failed original archive and byte-preserving correction. This qualifies
filesystem source only. Three mocked browser viewports pass with independent
result acceptance. Canonical checkout bytes,
approved commit/push/exact CI and hosted reconciliation remain open. Post-run
documentation is separate from the immutable selected snapshot.
Read-only Git clean-filter mapping and full local clean-source regression,
typecheck/lint/build are now independently accepted with original artifacts,
index and lock preserved. This closes local filtered-byte uncertainty, while
actual release checkout/commit/CI and hosted reconciliation remain required.

The expanded reviewed inventory is
`output/app-quality-release/supervised-release-29bdda8c-d37f-483d-a4f1-156e81560251/inventory.json`.
It covers63 explicit roots,299 files and19 migration dependencies. SHA-256:
`f6f12fd309501125ff20a6891405715b04afe293ae49cdc5e271300291e9ccae`.
Explicit compatibility roots cover runtime URLs missing from static imports;
inclusion does not authorize activation. Full local checks and their exact
limits are in [supervised-local-qualification-2026-10-03.md](supervised-local-qualification-2026-10-03.md).
The earlier35/211 inventory below is retained as historical evidence.

The original offline inventory is
`output/app-quality-release/supervised-release-dee4ca0d-8eb4-47ed-9c95-f9f833ebcd0a/inventory.json`.
Its SHA-256 is
`d6343a9249408b44409f234ea36e342ccfef611f6739e8e77a39628998932a46`.
It captures 35 explicit entrypoints and 211 files, including 19 migration
prerequisites, configuration and CI. All recorded source bytes were rehashed
successfully. The collector includes type and literal lazy imports and rejects
computed imports, missing local modules, source links and escaping paths.

The checkpoint is `d8a14817f0cc77281447722c378eef8ba1be41bf` on
`codex/programming-quality`. The application changes are uncommitted. This
checkpoint is not the release commit. Of the manifest files, 113 are changed;
966 changed files outside the manifest include review, test and generated work.
These counts are not a staging instruction. Tests, operators and evidence must
be selected separately, and unrelated work must be preserved.

Three maintained Node tests pass for dependency tracing, source-byte tampering,
computed/missing imports, escaping paths, source links and duplicate records.
Full nonincremental worktree typecheck passes. An independent review reproduced
the tests and verified the expanded 211-file inventory and its hash. The initial
sandbox output-write attempt failed with EPERM before any file was created;
the approved elevated local write succeeded. No hosted operation occurred.
The collector SHA-256 is
`08cfd191a938131436bcc2286891cdef6a38b10bddb67fd3f34e56d4250d8973`;
its Node test SHA-256 is
`33396226b9620fcc9cf7179711a0e64e41b92349034aa4d5e81544aa7213156b`.

The initial 32-entrypoint inventory was independently checked. Its review found
runtime-linked authentication paths outside static imports. The expanded
manifest includes the auth callback, profile API, onboarding page and
`vercel.json`. The profile onboarding API and AuthContext's WHOOP calls remain
explicit integration review items. The existing WHOOP cron is hashed for
compatibility; pilot preparation does not change that cron or authorize WHOOP
actions. Public assets and runtime URLs are outside the import closure.

## Target manifest required before release

| Field | Current record | Required confirmation |
| --- | --- | --- |
| Supabase project | `auolnfwetmfcwhtvakzy`, from earlier production release evidence | Fresh authorized readback of project, migration ledger, function definitions, ACLs and RLS; no current hosted state inferred |
| Vercel project and production alias | Earlier SociusFit deployment evidence exists | Exact project ID, alias, deployed source and compatible fallback deployment |
| Application artifact | Local uncommitted source inventory above | Approved scoped commit/push, independent exact-commit review, successful matching CI, deployment/source linkage |
| Athlete and program | Unconfirmed | Named athlete, owned program, current accepted reviewed base ID/hash and context revision |
| Reviewer | Unconfirmed | Designated authenticated reviewer identity; bounded packet access, separate athlete acceptance |
| Enrollment | No hosted enrollment approved | Exact new enrollment ID, expected current version, operation scope, explicit expiry and operator reference |
| Global numerical policy | Source `initialDosePolicy: false`; default reviewed registry empty | Preserve both through build, deployment and nonpilot verification |
| Supervised capability | Separate server flag `COACH_SUPERVISED_PROGRAMMING_ENABLED`, default off | Activation confined to confirmed database enrollment; no client flag provides authority |

## Migration reconciliation

The 19 hashed SQL files are layered prerequisites, not a replay script:

| Layer | Files | Release boundary |
| --- | --- | --- |
| Existing context and coaching pause | September 21 context revision and September 23 pause | Read back existing definitions and historical ledger; do not repeat completed cutover |
| Setup freshness | September 26 setup-memory bindings | Coordinate with separate `i40.15` release and its compatible weekly writers, invalidation and recovery requirements |
| Reviewed execution foundation | September 28 set reports/completion/registration/slots/next-week/recovery/resolution/qualitative support plus September 29 effort/RIR | Determine which exact objects and migrations are absent or already installed; qualify missing dependencies and writer compatibility |
| Supervised workflow | Six files from September 30 through October 3 | Preserve permanent program lineage, current enrollment guards, original receipt recovery and issuance closure preflight |

Compare source hashes with actual ledger statements and deployed function/ACL
state. Older migration bytes can differ from a historical application; do not
rewrite that history or silently treat a mismatch as missing schema. The local
PG17 migration planner and its predecessor hashes are local evidence. They are
not an executable hosted plan. Produce a separately reviewed, target-bound
ordered batch after readback. If prerequisite writers require a global coaching
pause, use the approved setup-freshness coordination plan and obtain its explicit
target authority. Scoped-pilot authority does not silently authorize that pause.

## Actual Next authentication qualification

Use an exclusive generated local runtime and retained synthetic identities.
Keep the canonical policy and registry unchanged; do not use the old
`reviewed-next-local.mjs enable-copy` mode for this supervised proof. That mode
enables the separate global numerical path in a generated copy.

Verify browser sign-in, actual AuthProvider and protected page routing, server
cookie identity, and real supervised/reviewed route composition. Anonymous
requests must return unauthenticated without packet data. An authenticated
foreign athlete must have no pilot discovery or direct session access. While
disabled or revoked, new issuance, acceptance and execution must be denied.
Permitted owner history reads and exact original request-actor receipt recovery
remain available; current reviewer packet/discovery access is denied. Preserve the
actual response status and kind instead of forcing every denial to be 404.

Authentication can create a missing profile, and AuthProvider can invoke WHOOP
initialization. Before launch, verify the fixture profiles and prohibit unrelated
external network calls. Record any generated local stub separately; it cannot
establish proof of the corresponding production path. The existing component
test-login shell proves none of these full Next composition claims.

Retain source/build hashes, exact per-request journal entries, known outcomes and
a durable pre-run baseline. Baseline coverage must state which tables it includes;
the earlier five-core-table digest does not cover Auth or profiles. Use explicit
verified shutdown and post-stop readback. No kill or uncertain mutation resend
can be counted as successful final preservation.

## Prepared rollout sequence

1. Confirm the athlete, accepted base, current context and reviewer. Review the
   entire first proposed week, with uncertainty returning for clarification.
   Synthetic qualification does not supply coaching suitability.
2. Actual Next page/cookie and revoked-write qualification is independently
   accepted under its bounded generated-login local contract; retain that evidence.
   Finish fresh full local checks, select the production dependency and test
   set, independently review it, then obtain commit/push authority. Require
   successful CI on the exact new commit; earlier CI cannot qualify these bytes.
3. Under explicit read-only target authority, reconcile hosted schema, ACL/RLS,
   accepted-base ownership and current deployment. Prepare the exact compatible
   migration/app sequence, enrollment and fallback artifact. Stop for any drift.
4. Request target-specific approval for the concrete reviewed rollout, including
   any setup-freshness coordination, migration, deployment, enrollment and scoped
   flag changes. Keep each action and recovery target identifiable.
5. Execute only that approved sequence. Before opening new scoped writes, read
   back deployed source, migration/function identity and default-off behavior.
   Verify unrelated/nonpilot users remain ineligible.
6. Append one exact enrollment version for the confirmed program/reviewer with
   approved operations/expiry. Verify its identity and version before using the
   scoped capability. Record a proposal, exact coach decision and separate athlete
   acceptance. Preserve original keys if any outcome is uncertain.
7. Track two real supervised cycles and their actual response. Read back the
   corrected evidence entering the next review. Local synthetic cycles prove the
   mechanism; they do not prove outcomes for the selected athlete.

## Disable and rollback

The first database safety action is a new disabled enrollment version for the
exact pilot program. Use `version_supervised_enrollment` with the expected latest
version and a stable new ID; retain its original request and receipt. If the
response is uncertain, inspect that exact identity before any new mutation.
Version conflicts require readback and review. Do not silently re-enable or reuse
an old enabled version.

The SQL enrollment guard protects direct RPC writers. Turning the server flag off
alone does not establish that database writes are disabled. Verify the disabled
version and denial of fresh proposal/execution, then disable the server capability
through the approved deployment/config action. Preserve receipt endpoints and
permanent lineage. Current reviewer discovery must end; exact owner recovery of
previously saved submit/issue/accept/set/complete results must retain the
original IDs and content. Historical designated reviewers recover their own
decision receipts; they do not gain renewed current packet access. Unknown
outcomes retain pending envelopes.

An app fallback must retain these compatible recovery endpoints and schema
contracts. Do not assume a deployment from before supervised programming is a
safe rollback: it can remove recovery while accepted history still exists. Name
and qualify the fallback artifact before rollout. Leave additive schema and
accepted history in place; no down migration, row deletion or schema restoration
is part of this preparation. A broader database restore needs a separate plan and
authority. After disable/fallback, read back unrelated accepted plans, pilot
history and original receipts, then record deployment and enrollment identity.

Local disable proof is retained in run
`05b21d07-5c79-42fa-9e1c-8ac87c44bca7`: 76 checks and 47 confirmed journal entries,
original saved receipts recover, current reviewer access is denied and the
pre-revocation core baseline is unchanged. This is local proof; hosted disable,
fallback and recovery remain unverified.

## Exit condition

Close `.17.5` only against its canonical acceptance criteria. A source manifest,
reviewed runbook, successful persistence or prior CI alone cannot close it.
Parent milestone acceptance, broader P0–P6/APEX completion and global numerical
activation remain separate. Beads owns status; board notes summarize checkpoints.
