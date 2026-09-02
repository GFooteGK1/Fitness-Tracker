# Adaptive coach release readiness — 2026-09-01

## Decision

The layered adaptive-coach database schema is live in production after Greg's
explicit approval on September 1, 2026. The application code is locally
release-ready but remains undeployed. A reviewed application release and an
authenticated end-to-end canary are still required before the feature is
released.

The release preserves the programming authority model:

1. The athlete sets a goal and confirms baseline facts.
2. The accepted plan remains immutable.
3. Sessions create canonical workout-linked observations atomically.
4. Qwik exports enter as normalized, unverified evidence that needs review.
5. Repeated compatible evidence can create an explained draft proposal.
6. Only explicit athlete acceptance activates a replacement plan.

One hard session, one readiness value, or one vendor score cannot silently
change training emphasis.

## Local evidence matrix

| Claim | Direct evidence | Result |
| --- | --- | --- |
| Typed goals, qualities, protocols, observations, and comparability | Contract and property tests in `test/coach/adaptive-programming-*` | Passed |
| Tenant ownership, RLS, grants, lifecycle, and lineage | Four rollback-only SQL verifiers and migration tests | Passed locally |
| Canonical workout linkage and exact completion retry | Atomic completion database verifier, API tests, and Today browser proof | Passed locally |
| Qwik duplicate, malformed-file, privacy, and exact retry behavior | Parser, route, RPC, component tests, and captured Chromium requests | Passed locally |
| Stale, future, unverified, incompatible, and cross-tenant evidence exclusion | Evidence-context fixtures and property tests | Passed |
| Repeated-evidence adaptation and counterexamples | Deterministic evaluator tests | Passed |
| Explicit memory, import, and proposal review | Trust RPC verifier, route/component tests, and browser proof | Passed locally |
| Existing application compatibility | Full Vitest, strict TypeScript, lint, and production build | Passed |
| Mobile and keyboard behavior | Chromium at 320 px and 390 px, desktop at 1280 px | Passed locally |
| Hosted Supabase database application and readback | Production project `auolnfwetmfcwhtvakzy` | Passed |
| Deployed authenticated goal-to-acceptance canary | Synthetic athlete A and athlete B | Pending separate approval and application deployment |

## Production database application

The isolated worktree was linked to the exact approved production project only
after Greg authorized the write. Preflight aligned the existing migration
history and listed exactly these four pending migrations, in order, with no seed
or role change:

1. `20260901152000_layered_adaptive_evidence.sql`
2. `20260901170000_atomic_coach_session_completion.sql`
3. `20260901183000_qwik_vbt_import.sql`
4. `20260901220000_coach_trust_review.sql`

All four applied successfully through migration history. Post-application
readback found all ten versions aligned, an empty dry run, zero database-lint
errors, all seven new tables and expected indexes/RPCs live, and zero rows in
the seven new import and review tables. Full command evidence and target identity
are in `../migrations/adaptive-coach-production-application-2026-09-01.md`.

The canonical migrations also pass repeat-application and rollback-only
verification locally. Those exact SQL verifier files were not executed directly
against production because this host had no `psql`, Docker-backed schema dump
was unavailable, and signed-in browser control failed before the SQL editor
opened. Do not claim direct production verifier execution without new evidence.

The remaining release gate is the authenticated application canary below.

## Authenticated application canary

Use disposable athlete A and athlete B accounts in a separately approved canary
environment. Keep all canary records synthetic. Do not use Greg's real athlete
state.

1. Athlete A records a goal, schedule, equipment, constraint, and known strength
   assessment.
2. Athlete A creates and explicitly accepts the initial plan.
3. Athlete A completes a scheduled Today session with readiness, the scheduled
   typed measurement, and a terminal result.
4. Repeat the completion request with the same payload and idempotency key.
   Confirm one canonical workout and one linked observation set.
5. Import the supported Qwik fixture from Program. Interrupt the first response,
   retry, and confirm one pending import. Confirm captured requests contain no
   raw JSON or bar-path arrays.
6. Resolve an ambiguous movement explicitly and confirm the import. Verify the
   original group remains in history and only the reviewed comparable group can
   enter evidence.
7. Add enough compatible, repeated synthetic exposures to run an adaptation
   review. Confirm one isolated outlier and one readiness value do not create a
   plan change.
8. Create an eligible replacement draft. Verify its rationale, confidence,
   included evidence, and exclusion reasons. Confirm the active plan is still
   unchanged.
9. Explicitly accept the draft. Confirm one new accepted plan version, one
   superseded prior version, and an unchanged historical prescription record.
10. Sign in as athlete B and confirm athlete A's memories, imports,
    observations, workouts, proposals, and plans are unreadable and unwritable.

Record request IDs, row IDs, counts, timestamps, exact application commit,
migration versions, screenshots at 1280 px and 390 px, and advisor results. Do
not record credentials, tokens, raw Qwik JSON, or athlete-private content.

## Quality gates before release approval

Run from a clean checkout of the exact release commit:

```powershell
npx.cmd vitest --run --root . --reporter=dot
npx.cmd tsc --project tsconfig.json --noEmit --pretty false --incremental false
npm.cmd run lint
$env:NEXT_PUBLIC_SUPABASE_URL='https://placeholder.supabase.co'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='placeholder-anon-key-for-build-only'
npm.cmd run build
git diff --check
```

All checks must pass. The four canonical migration files must be byte-identical
to their timestamped files under `supabase/migrations`.

## Data-preserving rollback

The forward migrations are additive. The normal rollback is application-first:

1. Stop promotion or redeploy the last verified application release.
2. Leave the four new migrations and any normalized evidence in place.
3. Confirm the previous application still reads existing plans, workouts,
   nutrition, and WHOOP data.
4. Revoke no grants and delete no data unless a separate incident decision
   identifies an active security risk.
5. Preserve imported manifests, observation lineage, review history, proposals,
   and immutable plans for diagnosis and later forward recovery.

Do not automatically drop the new tables, columns, constraints, policies,
triggers, or RPCs. A destructive database rollback needs a separately reviewed
data-retention plan, verified backups, exact affected-row counts, and explicit
approval.

## Approval boundary

The production database change was separately authorized and is complete. Greg
then separately authorized commit and push of the application candidate on
September 1, 2026. That publication does not authorize merge, deployment,
destructive database rollback, or creation of canary accounts and records.
Release approval still requires deployment authorization, deployment readback,
and the authenticated canary evidence above.
