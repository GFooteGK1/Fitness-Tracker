# Socius cleanup-first plan and first slice

The selected strategy is to inspect evidence, remove one unnecessary piece, verify
and review it, then reassess the smaller product before adding features. Beads
`Fitness-Tracker-vxe` owns the first implementation slice. This document records
its scope and evidence; it is not a replacement task tracker.

## Sequence and boundaries

For each candidate, inspect source consumers, contracts and available external
usage evidence. Select one bounded removal, establish a regression/rollback
checkpoint, implement, run relevant checks, and review the final diff before
selecting another piece. Do not introduce infrastructure merely to tidy code.

First preserve `/api/query`: source inspection found no current in-app request,
but absence of real external consumers is not established. Keep the `/query`
redirect for old links. The next endpoint candidates (`/api/prs/bulk-import` and
`/api/meals/analyze`) also need consumer evidence before retirement. Active chat,
photo/voice ingestion, provider dependencies and plan lifecycles require separate
workflow parity decisions. No broader retirement or new feature is included here.

## First slice: stop fetching unconsumed WHOOP query context

Baseline: `6e69232852876cb2e28f834e6ec77b531d17b93f`.
Branch: `codex/socius-cleanup-query-work`.

The only production caller of `fetchCrossDomainData` is `/api/query`. Its
`CrossDomainData` contract, `formatCrossDomainContext`, empty-data handling and
HTTP response metadata consume workout/nutrition records, never the extra
`whoop` property. Nevertheless the baseline fetches recovery, sleep and cycles
from three WHOOP tables. This slice removes those three unconsumed reads and
returns the existing `CrossDomainData` contract directly. Workout/nutrition
fetching, owner filtering, prompts, authentication and public response fields
are unchanged. The WHOOP integration and its other consumers are untouched.

Sources: `app/api/query/lib/types.ts`,
`app/api/query/lib/response-generator.ts`, `app/api/query/route.ts`, and all
tracked `fetchCrossDomainData` references. The standalone WHOOP fetch helper/type
are left outside this bounded call-path change; their separate cleanup can be
reassessed without expanding this slice.

The new route regression uses synthetic records and mocks the model seam. It
checks unauthenticated rejection before reads/model use, the populated public
response and exact model data context, empty-data behavior, the four required
source reads and their owner filters. On unchanged baseline code the auth case
passed and both data cases failed specifically on the three extra WHOOP reads.

## Access and preparation evidence

- Vercel project metadata read for `fitness-tracker` under
  `gregs-projects-98860c8b` returned 403: the connection was not authorized for
  that scope. The path was stopped; no alternate credentials/endpoints or
  reauthorization were attempted. Traffic counts and external use remain unknown.
- Earlier sandboxed `git -C C:\Dev\Personal\repos\Fitness-Tracker` reads
  returned Permission denied. Reviewed `require_escalated` execution subsequently
  permitted status/fetch/worktree creation. The existing dirty checkout was not
  reset or switched. The cleanup uses a new worktree inside the authorized task
  workspace, not a copied repository to bypass denied access.
- The first sandboxed `npm ci --no-audit --no-fund` failed with
  `Exit handler never called!`. A reviewed escalated run installed the unchanged
  lockfile successfully (671 packages). No dependency manifest/lock change was made.

## Verification and rollback

Baseline regression: 3 tests, 1 passed, 2 failed, 0 skipped (expected sensitivity).
Affected query/WHOOP-prompt/redirect checks: 83 passed, 0 failed, 0 skipped.
Type-check passed. Lint passed with the existing warnings in
`PhotoMealReview.tsx:124` and `app/v2/page.tsx:266`.

Full suite: 6,195 passed, 0 failed, 44 skipped, 0 todo across 473 collected files;
315.9 seconds. Skips retain the existing live/evaluation, retained local-service,
native PostgreSQL/Linux and historical non-acceptance gates. No skipped test was
enabled with real credentials. Type-check, lint and the local production build
all exited 0. All 32 local mobile browser journeys passed, with 0 failed,
0 skipped and 0 flaky cases (5.7 minutes). Their dev server used placeholder
Supabase configuration and the existing intercepted-service fixtures.

Live LLM/evaluation and Supabase-pull gates are disabled; service configuration is
synthetic. This work does not establish production deployment, traffic, athletic
outcomes, measured latency or monetary savings. Baseline main CI was already
successful; this final-branch execution is separate evidence, not reuse of that
result. The new regression also reproduced the unwanted reads on baseline.

Focused main-thread code/test review found no actionable issue: the only runtime
consumer drops WHOOP before model input and public output, auth/ownership paths
are unchanged, populated/empty contracts are retained, and the baseline is caught
by the same final regression. This is a narrow standard-risk cleanup; no claim
of an independent reviewer or live authorization qualification is made.

Rollback is a single revert of this slice's commit (or its scoped diff before
commit), restoring the baseline fetch call. No schema, credential, athlete-data,
accepted-plan or production configuration rollback is required. No merge or
production deployment is authorized by this slice.
