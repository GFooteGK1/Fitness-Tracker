# Photo review - next qualification stage

Follow-up: the [approved single Claude test](2026-10-06-claude-live.md) passed.
The text below preserves the preparation checkpoint and its original limits.

The implementation is still local on `codex/photo-review-drafts`. Remote main was
checked again: `d3c07c59bae4c7b9782460823381e3e82cd793f2`. This stage made no push,
deployment, provider call, hosted data write or credential change.

## Live target preflight

Read-only Supabase catalog checks verified the active `fitness-tracker` project,
`auolnfwetmfcwhtvakzy`. It has `begin_logging_request`, `finish_logging_request`,
`save_activity_draft` and both `commit_activity_draft` signatures. All checked
functions are security definers with an empty search path, authenticated execution
and no anon execution. RLS is enabled on `activity_drafts`, `activity_mutations`,
`logging_requests`, `logging_request_items` and `meals`. Capture read policies
restrict records to `user_id = auth.uid()`. Capture migration `20260918020000` is
recorded as applied. These checks establish schema/access readiness, not successful
authenticated requests, exact deployed function-body parity or concurrency.

The Vercel connector can access only `Edu Ops Projects`. Inspecting SociusFit
project `prj_RocmjxStsTrtmrDaqMddMnb29ENh` under `team_zjdKVgrSBNAYC9gql0Raiocm`
returned 403 requiring access to `gregs-projects-98860c8b`. A local CLI inspection
produced no result and was stopped. Provider configuration, capture flag and
deployment revision remain unverified. No access/token changes were attempted.

The documented private PostgreSQL runtime and listener on port 55437 are absent.
Independent backend locking remains unqualified. No runtime was installed and no
hosted race performed. Existing PGlite tests cover the local transition contract.

## Prepared Claude test

`scripts/verify-photo-review-claude.mjs` launches an opt-in qualification through
the actual analyzer and route code. Auth transport is replaced by the local
fixture; database writes stay within isolated PGlite.

- One Anthropic Messages HTTP request; zero SDK retries; redirects rejected.
- Fixed model `claude-sonnet-4-6`, at most 1,024 output tokens, 45-second timeout.
- Approved JPEG hash required; 1 KB to 1 MB file size.
- Only the Anthropic key is imported from the specified secure environment file.
- SDK debug output disabled; unrelated global network calls rejected.
- Exclusive start marker prevents silent resends after interrupted attempts.
  Hash-specific receipts and a separate finish marker preserve earlier evidence.
- Receipts contain token counts, provider request ID, photo hash and outcomes;
  no credentials, image bytes or raw model responses.
- Replay/reload reuse analysis; correction changes no totals; acceptance creates
  one local meal and preserves estimated origins. Dismissal uses an estimate copy
  to avoid a second provider request.

Proposed input: Greg's previously supplied granola photo (Photo 3 from the food
screening examples), 118,614 bytes. SHA-256:
`80c423882007dbc0d47af9045caecf169dbbd91a401cf1822efd845197fa06ea`.
Specific approval is required to send this image to Anthropic. The test will not
change Greg's real nutrition totals or save the photo in application storage.

After approval, from this checkout:

```powershell
node scripts/verify-photo-review-claude.mjs --approve-live --photo '<approved JPEG path>' --sha256 80c423882007dbc0d47af9045caecf169dbbd91a401cf1822efd845197fa06ea --env-file 'C:\Dev\Personal\repos\Fitness-Tracker\.env.local'
```

Do not repeat after an uncertain result. Inspect the start marker, finish marker
and receipt first. Another attempt needs specific authorization and must preserve
the original evidence.

## Evidence and next release boundary

Dry run passed all five transitions and intercepted one SDK request; no actual
provider HTTP request occurred. It also passed with inherited `DEBUG=true`.
Independent review closed request-method, debug-output, receipt overwrite and
redirect findings; no blocking source findings remain. TypeScript and launcher
syntax passed. Fresh focused regression: 33 passed; the opt-in live test was
skipped by default as intended.

Dry command: `node scripts/verify-photo-review-claude.mjs --dry-run`.
Evidence: `output/photo-review-drafts/claude-dry-receipt.json` and
`output/photo-review-drafts/next-stage-tests.json` (ignored local artifacts).

After a successful bounded Claude test, restore read access to the correct Vercel
scope, inspect provider/flag configuration, and prepare a preview from this branch.
Preview shares production Supabase; do not use synthetic hosted writes as a canary.
A real approved photo should first create only an owned draft. Greg can then
verify reload/correction on iPhone and separately confirm acceptance into his
history. Read back the receipt and totals before another occurrence.

Commit/push, deployment and real nutrition-history changes require target-specific
authority. This stage releases no native TestFlight build and does not connect
Camera-close to unattended uploads. Hosted Auth/PostgREST, hosted locking, iPhone
behavior, classification quality and macro accuracy remain unverified. Decisions
API stays deferred. Beads is unavailable; no canonical claim or closure was made.
Private project-board reporting is a progress record only.
