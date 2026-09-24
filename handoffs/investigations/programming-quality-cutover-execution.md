# Approved cutover execution investigation

Current state: both migrations are installed, the pinned deployment is promoted, and coaching is paused at generation 1. Fresh recovery passed all 94 scopes. The first synthetic profile insert failed; the corrected same-account continuation is tested and independently reviewed, but requires new approval. Do not reinstall, re-promote or resume before that approval. The sections below preserve the execution history.

## 2026-09-24: private rendered-evidence transport

Attempt 1: import the reviewed smoke operator in cua_repl to use its local-only evidence sealing export. Failed before any evidence write with `process is not defined` in the browser runtime's transitive Node dependency environment. Accepted-plan IDs and hashes remain in memory, without plaintext disk or transcript output. No production retry occurred.

Revised local method: minimal crypto-only public-key envelope writer with no process, SDK or child-process dependency in cua. Create and seal the private key through the existing DPAPI/AES storage helper outside cua; expose only its public key. Require independent review and synthetic roundtrip before use. This changes only local encrypted evidence transport, not the approved SQL or production boundary.

A rendered catalog Playwright cell selector also timed out once; the already-captured accessibility result contained the full catalog and was parsed directly. Exact catalog comparator then passed. No repeated SQL query or database mutation was needed.

Attempt 2: the minimal reviewed crypto-only module imported in CUA, but its private-path check failed with `EPERM: operation not permitted, lstat` for the fixed backup directory. No evidence file was written. This is a CUA filesystem/ACL boundary, distinct from the resolved module-global limitation.

Reassessment before attempt 3: the already-reviewed pure encryptEvidence function needs only the public PEM and in-memory baseline. Encrypt in CUA, save ciphertext-only envelope to the writable ignored cutover workspace, then use the approved elevated native filesystem operation to move that exact envelope to the private backup child. Verify OAEP/GCM authentication with the sealed private key and keep all plaintext internal. No browser-private-folder probe or plaintext intermediate is needed. One bounded attempt; a failure stops this blocker and invokes the approved pre-revision abort conditions if recovery cannot be completed.

Attempt 3 passed: pure CUA encryption produced only a ciphertext envelope in ignored output. The independently reviewed receiver created a private destination file with inherited ACLs, verified its ACL, required exact project/backup/run/name/key binding, authenticated RSA-OAEP-SHA256 plus AES-256-GCM with a full 16-byte tag, and sealed the authenticated JSON under the existing DPAPI-protected backup key. No plaintext intermediate or transcript output. The encrypted transfer copy is retained; no deletion occurred. Evidence persistence blocker resolved; no further remedy attempted.

Whole-query editor newline concern was resolved by inspection: cutover-migrations.mjs normalizes CR before function-definition hashing. Exact original migration ledger bytes remain protected by escaped E-string literals. No extra database trial was required.

## Post-promotion read-only observation mismatch

The one approved promotion succeeded. Fresh platform readback passed exact project/owner/deployment, all three aliases, unchanged 31 bindings and redirects, and no rolling release. Required rendered build ID matched. The supplemental checker then compared raw server HTML script paths with the prior hydrated browser DOM snapshot: 10 versus 9, so it stopped before remaining asset and redirect checks. No account, key read, synthetic write or resume occurred.

Read-only reconciliation identified extra path `/_next/static/chunks/8760-75fbdc0ed9c27408.js`. Retained artifact verification records the live HTML hash `d96a2fe9afc205c55a8ca5c47b4eabe29f9445a4958651e7f454e744cc8e5543` exactly as `functions/auth/signin.prerender-fallback.html`, plus the extra chunk. Independent retained-tar verification subsequently passed. A supplemental read-only check verified exact HTML/artifact identity, CSS, icon, the extra chunk and both redirects. The original failed receipt is preserved. No promotion was repeated or artifact identity criterion relaxed. The reason for the earlier browser omission was not measured.

## Synthetic provisioning stopped after one failed profile insert

The single official CLI API-key read succeeded, and the frozen synthetic Auth account was created once. Profile upsert then returned HTTP400 / SQLSTATE23502: `null value in column "user_id" of relation "user_profiles" violates not-null constraint`. No sign-in, application request, proposal or acceptance followed. The one-shot marker and encrypted response remain intact; no retry was issued.

Independent SQL read showed the live `set_user_profile_user_id` BEFORE INSERT trigger invokes `public.set_user_id()`, whose body unconditionally assigns `NEW.user_id = auth.uid()`. The existing service-role request has no athlete subject. The validated UUID supplied by the SDK is therefore replaced with NULL. Local bootstrap omitted this base profile trigger, so earlier local Auth/HTTP rehearsal did not cover this production behavior.

Reconciliation found exactly one synthetic Auth user and one identity. All 54 public user-owned table scopes are empty for this owner; sessions and the other inspected Auth user-owned scopes are empty. The existing production trigger is unchanged. Both migrations remain installed, exact deployment is promoted, and coaching remains paused at generation1. The old application is incompatible and is not a rollback target.

Revised method prepared, tested and independently reviewed: reuse the same retained synthetic account/password and frozen public anon binding; sign in first, then create its profile as that authenticated owner. Use one new bounded continuation marker, verify the exact known failure and baseline, then complete remaining originally approved paused rejection/create/accept/re-pause/replay/digest gates. No second API-key read, account, schema change or deletion. This requires explicit approval for one additional provisioning attempt under the approved packet's one-attempt rule; no dependent production action proceeds before that approval.
