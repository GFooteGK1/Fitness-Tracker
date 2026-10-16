# Reviewed HTTP mutation boundary — local checkpoint

Date: September 27 Chicago / September 28 UTC, 2026.
Canonical task `Fitness-Tracker-u5l.6.12` remains in progress.

## Implemented

Dedicated reviewed routes now compose authenticated handlers for proposal
issuance, acceptance, actual-set reports and version-3 completion:

- `POST /api/coach/reviewed/proposals`
- `POST /api/coach/reviewed/proposals/[id]/accept`
- `POST /api/coach/reviewed/sessions/[id]/sets`
- `POST /api/coach/reviewed/sessions/[id]/complete`

`reviewed-http-server.ts` accepts exact envelopes with `expectedUserId` and stable
`requestId`. Proposal input contains only review/registration IDs. Set input uses
the strict actual-report parser; completion passes the exact version-3 envelope
to the existing strict SQL validator. Neither route constructs actuals from
targets. SQL remains authoritative for owner checks, current active execution,
source freshness, latest-revision manifests and exact replay. There is no new
current-state preflight that could prevent recovery of a committed request.

Confirmed saves return their mutation result directly; an unrelated context
refresh cannot turn them into failed saves. Uncertain transport or malformed
success responses retain retry semantics without automatic mutation resend.
Errors never instruct clients to replace a request key. Account mismatch is
rejected before mutation. Every response is private/no-store.

The actual route composition uses the existing hard-disabled numerical
capability. Neither a request body nor a query parameter can enable it. Local
tests inject server-owned clients/capabilities into the handler factory. This
adds no production enable switch, registry authority or hosted activation.

## Verification

- **91 tests across five suites pass**: HTTP boundary, actual route wrappers,
  legacy acceptance regression, reviewed issuer and actual-set parser.
- Full nonincremental TypeScript check and scoped ESLint pass.
- Final real loopback receipt:
  `output/app-quality-release/reviewed-proposal-56ea174c-49a4-4a0b-8645-4babba48c21d/receipt.json`,
  **255 checks pass**. Intermediate run
  `6fe42e69-1d6b-4909-ba7d-e19eb91fab3e` also passed255 before uppercase coverage.
- The harness invokes real Request/Response handlers backed by authenticated
  Supabase/PostgREST and PostgreSQL. It is not an actual HTTP-server/browser test.
- Checks cover reviewed proposal/acceptance replay, five mapped sessions,
  committed set-response loss and exact recovery, append-only correction,
  retained unknown load/rest, stale completion-manifest rejection, canonical
  capture receipt and replay, terminal set replay and foreign/account denial.
- Independent review identified case-sensitive completion-ID comparison after
  case-insensitive UUID validation. Validated path IDs now normalize once to
  PostgreSQL's lowercase representation. Unit completion and real completion
  replay use uppercase paths and pass. No SQL change or migration was needed.
- Final independent review reran **28 handler/route tests**, inspected the
  255-check receipt and confirmed the finding resolved with no remaining blocker
  for this slice. Reviewer performed no database writes.

## Remaining task scope

Owned session/latest-report readback, durable pending requests across reload,
interactive reviewed proposal/session UI and actual local browser lifecycle are
still required under `.12`. These mutation handlers alone do not close that task
or W5. W10 and broader programming gates remain open. No migration, deployment,
hosted writes, numerical activation, commit or push occurred in this slice.
