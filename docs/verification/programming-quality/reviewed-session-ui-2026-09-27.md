# Reviewed session readback and UI — local checkpoint

Date: September 27 Chicago / September 28 UTC, 2026.
Canonical task: `Fitness-Tracker-u5l.6.12` remains in progress.

## Implemented behavior

Authenticated `GET /api/coach/reviewed/sessions/[id]` now returns the owned
canonical session, its exact prescription, complete report history and the latest
report-ID manifest. Active mapped membership controls an advisory writable flag;
SQL still checks it on every write. Completed/historical sessions stay readable.
The reader verifies every report's owner, root, immutable prescription/activity
snapshots and contiguous revision chain. Exact counts reject truncated history.
Before/after source revision, root, program pointer and authentication checks
reject changed reads. No revision row is initialized by the reader.

`/program/reviewed/[id]` displays preparation/working prescriptions and an actual
set form. Actual values begin unknown; prescriptions never supply actual reps,
load, RPE, rest, symptoms or velocity. Correction copies the saved actual report
and increments its revision. Set numbering advances separately by side. Local
occurrence input uses timezone utilities. Rep velocity retains its device,
method and individual measurements; newly added measurements begin blank.
Full actual details, unknown values and prior revisions remain inspectable on
read-only completed sessions. Completion uses the latest exact report manifest,
explicit outcome and explicit/unknown feedback provenance.

`reviewed-session-pending.ts` stores a detached exact owner/session request in
sessionStorage and verifies persistence before sending. Reload recovers it.
All errors, malformed responses, account changes and uncertain responses retain
it; no automatic mutation resend or replacement ID. New reports are blocked
while a previous request is unresolved. A matching acknowledgement alone clears
the matching pending entry. Corrupt/unavailable storage blocks new writes and
is preserved. This provides same-tab reload recovery, not cross-device recovery.

The weekly state exposes the hard-disabled reviewed capability. Session links
appear only when it is enabled by the server; the actual GET/POST route
composition remains disabled. No browser flag or environment activation switch
was added. The existing default program view stays read-only for this format.

## Evidence

- **86 tests across seven suites pass**: reader, pending requests, session UI,
  reviewed week view, HTTP handlers, actual gated routes and weekly API.
- Full nonincremental TypeScript check and scoped ESLint pass. Initial undefined
  program/plan narrowing errors and an effect cleanup warning were fixed.
- Real loopback receipt:
  `output/app-quality-release/reviewed-proposal-288a3b18-4ab4-4806-903b-015a53cdf58d/receipt.json`,
  **259 checks passed**. New checks cover owned canonical readback, correction
  history/latest IDs, terminal read-only actuals and foreign404 without disclosure.
- UI tests cover unknown actual defaults, explicit measured velocity, immutable
  corrections, complete terminal readback, independent side numbering, exact
  request recovery across unmount/remount after a lost response, latest-manifest
  completion and corrupt-storage retention. DOM tests use mocked transport;
  the loopback checks invoke handlers against real Auth/PostgREST/PostgreSQL.
- Independent review found two UI defects: incomplete terminal actual display
  and left-side numbering carried to the right side. Both are fixed and have
  focused UI regression coverage. Final independent review reran **38 tests**,
  inspected the 259-check receipt and confirmed both findings resolved with no
  remaining blocker for this slice. Reviewer performed no database writes.

## Still required

This is not actual browser/network lifecycle proof. `.12` still includes reviewed
proposal presentation/acceptance and durable proposal-request recovery, safe
resolution/editing of rejected pending session requests, and local browser
end-to-end verification. Pending failures currently stay preserved and block new
work; repeated retry alone is not the resolution UX for a definitive rejection.
Any cancellation/no-write proof must also fence a delayed original attempt,
preserve saved receipts and avoid discarding uncertain user work.

No migration, hosted write, numerical activation, commit or push occurred.
All changes remain local/uncommitted. W5, W10 and broader programming stay open.
