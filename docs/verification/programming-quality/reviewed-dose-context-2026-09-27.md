# W5 authenticated reviewed-source adapter

Task: `Fitness-Tracker-u5l.6.3`. Branch: `codex/programming-quality`.
Parent W5 and programming-quality P0/P1 remain unfinished.

## Implemented boundary

`reviewed-dose-context-server.ts` derives the owner from Supabase Auth, reads the
owned active accepted rolling plan through the existing decoder, and checks a
trusted server registration before invoking the offline compiler. Requests select
only an option ID. They cannot supply a profile, evidence facts, review registry
or replacement digest. The registration is a separately reviewed record of the
exact bounded context; the module neither creates reviews nor infers approval.

The source packet includes canonical workout blocks, notes/input text, completion
responses, capture revisions, setup bindings, memories including withdrawn rows,
assessments, performance observations/values and measurement imports. Existing
history and performed-work interpreters preserve provenance and missingness.
Unknown older history and outside logging remain unknown. Complete bounded reads
do not prove complete athlete evidence or numerical sufficiency.

Owner-scoped SELECTs bracket reads with context revisions. They avoid the revision
RPC's first-read insert. Re-reading the active program/base detects changes not
covered by revision triggers. Setup must still match the accepted profile, and
canonical training intent must match the accepted snapshot. Clock-derived memory
lifecycle is fingerprinted and checked again at the end. Exact counts detect
server row caps; collection ordering has deterministic ID tie-breakers.

Current reads explicitly retain post-cutoff rows and reject clock skew rather
than silently treating a newly saved workout as absent. The default reader and
historical replay preserve their existing cutoff semantics. The selected current
history window must reach athlete-local today. No biological expiry is inferred.

The result remains non-persistable and numerical runtime eligibility remains
false. There is no route wiring, default live registry or activation change.
The trusted registration is copied before asynchronous reads to prevent mutation
of in-flight review authority. Accepted source plans are never edited.

## Verification

- 278 tests pass across16 matched adapter, compiler, history, setup and weekly
  planning suites; full typecheck and focused lint pass. Diff check passes.
- Independent review: no blocking findings. Final focused rerun111/111 passed;
  reviewer inspected integration source and passing receipt without rerunning it.
- Real local Supabase Auth/PostgREST/PostgreSQL integration passed24 checks.
  Run `e56b1a75-e661-425d-bf0c-73da1be27153` finished
  `2026-09-27T23:07:32.417Z`; receipt:
  `output/app-quality-release/reviewed-dose-e56b1a75-e661-425d-bf0c-73da1be27153/receipt.json`.
- Actual checks establish stable owned source reads, no revision advancement from
  adapter reads, owner-only offline compilation, RLS hiding the foreign plan,
  canonical source amendment advancing revision, stale registration rejection
  and unchanged accepted intent.
- The opt-in harness uses fixed verified loopback targets and fresh synthetic
  users. Admin seeds only the synthetic accepted base; workload logging and
  correction use authenticated canonical capture/amendment RPCs. This does not
  test acceptance of a new numerical plan. Earlier failed fixtures are preserved.
  See `handoffs/investigations/Fitness-Tracker-u5l.6.3.md` for both diagnosed failures
  and the bounded third-run success. No production data or hosted credentials used.

## Remaining requirements

W5 still needs complete profile/schedule/exposure reconciliation, preparation
eligibility, actual whole-week timing, basis/snapshot integration and persisted
numerical-plan acceptance/readback. A read-only snapshot does not provide atomic
publication protection after return; existing transaction-owned acceptance
checks must bind the eventual numerical proposal. No numerical activation,
production migration/deployment, P0/P1 completion or W10 outcome is claimed.

All changes remain local and uncommitted.
