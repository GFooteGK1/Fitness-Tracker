# Milestone one: actual Next revocation denials

October 3, 2026. Canonical task: Fitness-Tracker-i40.17.5, in progress.
Goal: qualify supervised management of one named athlete's reviewed program and
prepare its scoped production pilot. Broader programming qualification remains
unfinished. Global numerical policy remains false.

## Fixture readiness and preserved failure

Isolated local setup `213e7358-29c9-4886-bc31-d1a97797a0a8` created three synthetic
actors and two programs. The first has an approved registered candidate that was
never issued. The second has an issued, unaccepted proposal and an untouched
accepted base. Both scopes were revoked once, by appending disabled version two.
Four exact POST envelopes were reserved before revocation. The synthetic set
report binds to prescribed squat work: 245 lb, three repetitions, RPE 7, RIR 2.
Preparation did not record performed work.

All 32 setup requests have confirmed outcomes. The setup's original receipt stays
`inspect_required`: its table allowlist omitted `recommendation_refresh_state`.
The existing source-invalidation trigger explains that change, as defined in
`20260918050000_recommendations.sql`. No request was retried or fixture recreated.

An independently reviewed, separately retained read-only audit passes eight
checks. Every prior public row and Auth identity remains preserved. All added
recommendation invalidation rows belong to the isolated actors. Exactly two
revoked enrollment rows were added after staging; both are the latest exact
disabled version-two scopes. First issuance, acceptance and performed work remain
absent. The original failed receipt remains unchanged.

Audit directory: `output/app-quality-release/supervised-denial-audit-213e7358-29c9-4886-bc31-d1a97797a0a8`.
Fixture SHA-256: `b9301747e8637eda4ae1ce9ac6a093885e64e6dfb091f25ce7f7a06f370efb6b`.
Independent review accepted bounded fixture readiness.

## Actual Next route qualification

Fresh contract-three run `127a4376-d351-4a33-a26a-78a16eb10b7a` uses the actual
Next 15 root AuthProvider, cookies and application route handlers in an isolated
copied runtime. Generated local login/probe controls are test controls. Fixed
loopback targets are Next port 3013 and retained local Supabase port 55321.
The harness permits only reserved raw request bytes; whitespace variants,
replacement keys and repeated dispatches are refused before invoking Next.

| Reserved operation | Actual route result | Evidence boundary |
| --- | --- | --- |
| First issuance of approved unissued candidate | 503 `retry_required` | One exact issuance RPC returned SQLSTATE `55000` and the exact enrollment-changed-or-disabled message |
| Accept issued unaccepted proposal | 409 `disabled` | Actual acceptance handler, original issue request key |
| New set report against accepted base | 409 `disabled` | Exact prescription-bound synthetic report; no report saved |
| New completion against accepted base | 409 `disabled` | Exact reserved completion; no workout saved |

Anonymous plus all three actor identities were verified through actual cookie
routes. Each reserved write envelope reached its actual handler exactly once.
The browser signed out and its temporary tab closed before finalization.

Exact shutdown marker `b718f118-58ec-467f-a65f-bd786871a36b` drained the runtime;
the server process exited zero. Fresh verification passes 417 runtime file hashes,
unchanged histograms of 59 public tables plus the Auth identity projection, and
all 64 confirmed journal entries. Auth token/session fields are excluded from
the identity projection. No profile or business row changed during this run.

Receipt SHA-256: `646f50e7c8a07e36485af0a5fd46580f483c3db5769e5477435a4ff7f045ebae`.
Receipt directory: `output/app-quality-release/supervised-next-127a4376-d351-4a33-a26a-78a16eb10b7a`.
Independent final evidence review accepts the bounded local denial qualification.

Verification: two envelope tests, seven Node boundary tests, full nonincremental
TypeScript check, operator syntax checks, retained-local readiness audit and fresh
Next final readback. Setup loading also passed its opt-in skip check; a skipped
setup test is not execution evidence. Earlier failed Next receipts are retained.

## Remaining milestone boundaries

This is synthetic local authentication and denial proof. It does not establish
production deployment, password/PKCE flows or coaching suitability. The named
athlete, suitable owned accepted base and designated reviewer are still unconfirmed.
Next: confirm those choices and review materially different complete-week decisions;
then freeze and independently review the release dependency/migration set. Commit
and push need current authority; qualify matching CI afterward. Hosted migration,
enrollment, deployment and activation require exact target-specific approval.
No hosted action, global numerical activation, commit or push occurred here.
