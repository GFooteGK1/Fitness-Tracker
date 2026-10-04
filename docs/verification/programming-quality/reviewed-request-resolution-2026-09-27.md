# Reviewed session request resolution

Date: September 27 Chicago / September 28 UTC. Tracker: `Fitness-Tracker-u5l.6.12`, still in progress.

## Behavior verified

- Owner-authenticated POST `/api/coach/reviewed/sessions/[id]/resolve` accepts
  only the original operation, request key, payload and expected account.
- The protected RPC serializes against the existing writer. A committed request
  returns its original receipt; an absent request receives an immutable fence
  that prevents later set or completion writes using that key.
- Completion rejection rolls back tentative workout insertion. No-write replay
  preserves the same resolution ID/time. Conflicting payloads, cross-session key
  reuse, anonymous users, foreign owners and direct table access are denied.
- Resolution of completed and skipped sessions preserves receipt semantics.
  The completion trigger also permits the existing authenticated execution
  amendment flow; no direct table grants were added.
- Pending browser state is released only after verified resolution and local
  archive readback. Errors, account changes, mismatched responses, concurrent
  pending replacement and archive failures retain the request.
- The UI requires explicit resolution. Unsaved set actuals and completion
  feedback return for editing. A new request key is created only on a deliberate
  submission. Completion uses the current manifest/time, retaining entered
  feedback. Explicit form keys handle batched instant-refresh responses.

## Evidence

- 107 focused tests across eight HTTP, route, state, recovery and UI suites pass.
- Full `npx tsc --noEmit --incremental false` and scoped ESLint pass.
- Independent review: SQL pre-apply review; final 60 tests pass with no unresolved
  material findings. The completion-feedback restoration finding was fixed and
  covered by a DOM regression.
- Real loopback Auth/PostgREST/PostgreSQL: **307 checks passed** in
  `output/app-quality-release/reviewed-proposal-e3e84ffc-aff3-49b5-9400-7f0b8f9dd1fd/receipt.json`.
  This includes both writer-versus-resolver races, late requests, complete
  transaction rollback, stable recovery, deliberate replacement and ownership.
- Migration `20260928070000_reviewed_session_request_resolution.sql` installed
  once on `supabase_db_sociusfit-programming-local` (API 127.0.0.1:55321).
  SHA256 `9D7881E7FFFCE004621904A1E611A92AC9EA8B3107B7EC072FEA65A7CE8485FD`.
  Success log `reviewed-set-migration-231af9ec-d7d4-46f7-8a37-5baedb841bf4.log`.
  Never replay installed migrations or reset this retained evidence.

## Failed checks and corrections

1. Initial migration transaction rolled back on a PL/pgSQL CASE parsing error
   in the request-length condition. Parenthesizing the CASE fixed it. The fixed
   preflight confirmed absence before the one successful installation. Failed
   log: `reviewed-set-migration-e2a5aeb4-7519-4da2-a3c7-fd39ebaa75e6.log`.
2. Source-fixture preparation failed first on a DB timestamp ahead of the process
   cutoff (`6d2bb0c3-82c3-4e81-b6c8-ec983d4fc58c`), then on ambiguous accumulated
   same-day synthetic completions (`d683a408-7c29-4139-803d-bfa8b6636d17`). After
   those two attempts, fixture creation was moved before additional completion
   writes; the storage tests do not need newly compiled authority afterward.
   Production evidence gates were not relaxed. That change passed the prior
   blocker and all resolution/race checks.
3. The unrelated-write probe then hit the existing service-role INSERT denial
   (`04a897b5-3773-4f0b-b64c-71064341dbe9`, 305 checks). It was replaced by the
   supported authenticated `amend_program_execution` RPC; final run passed.
4. Typecheck initially rejected casts from unknown records; validated response
   objects are now constructed explicitly. DOM tests caught batched refresh
   retaining empty forms; explicit form revision keys fixed both restoration
   cases. Final typecheck, lint and 107 tests pass.

## Boundaries and next work

No hosted changes, numerical activation, commit or push. Default route capability
remains false. Existing cutover is not repeated; prior unrelated work is retained.
This is real database-backed handler verification, not an actual browser/network
lifecycle. Session-storage archives are local to the browser tab; no-write fences
are durable in SQL. Proposal presentation/acceptance, durable proposal recovery,
and actual local browser lifecycle remain in `.12`; W10 and broader QPlan gates
remain separate.
