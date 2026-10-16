# Reviewed execution continuity — local verification

September 27 Chicago / September 28 UTC. Canonical task `Fitness-Tracker-u5l.6.11`
remains in progress. Branch `codex/programming-quality`; changes are uncommitted.

## Result

An unchanged dated prescription keeps its original canonical execution row when
the accepted week is replaced. New immutable planning-slot associations refer
directly to that row. Actual sets, completions, workouts, checkins and retry
receipts are not copied. Moved unstarted sessions receive new execution rows.
Changing or removing begun/terminal work requires review. Full prescription
equality includes preparation, protocols and review provenance.

The accepted plan's immutable `reviewed_execution_slots_v1` marker selects the
effective-session view. Missing associations cannot fall back to partial physical
rows. Authenticated source version 3 binds the complete ordered execution manifest
and bounded raw legacy signals. Schema-2 registration carries the reconciled root
map. SQL independently derives that map, locks canonical roots before the context
revision fence, and verifies the full manifest during issuance and acceptance.
Set/completion writers resolve membership in the active accepted plan while
retaining the original execution identity. Exact retries still precede freshness.

Runtime athlete context reads all mapped sessions and queries checkins by root
IDs. Evidence-context selection recognizes carried roots. Both readers fail
closed for missing, truncated, foreign or inconsistent mapped manifests. Existing
unmarked runtime plans continue using their original reads.

## Evidence

- Applied `20260928040000_reviewed_execution_slots.sql` once to existing local
  container `supabase_db_sociusfit-programming-local`, API `127.0.0.1:55321`,
  database `127.0.0.1:55322`. No reset, bootstrap replay or fixture deletion.
- Applied SHA256:
  `11E77658525937F888E08AE4D9B7683EBC2EEDF48B5A1AAA30C1B8823F55A7FA`.
  Log: `output/app-quality-release/reviewed-set-migration-b85460ff-55d0-457d-9881-ba19e6f13f1a.log`.
- Real Auth/PostgreSQL proposal run
  `output/app-quality-release/reviewed-proposal-f33d2e13-f29f-448f-9685-bbf529f38b47/receipt.json`:
  **137 checks pass**. Includes completed Monday plus begun Friday through the
  Tuesday/Wednesday swap, exactly two new physical rows, continued set capture,
  canonical completion/checkin, foreign isolation, denied mapping updates,
  repeated replacement without alias chains, original receipt replay, concurrent
  issuance/acceptance, legacy-signal races, and stale/tampered/expired rejection.
- Existing real local source flows pass after the migration: session **25** checks
  (`05e49a45-8817-4577-80da-1fedbe053247`), week **52**
  (`9bcd53e7-4cdd-40e1-8ff5-8b8f3860df48`), full-week **57**
  (`995107b5-df0c-42c6-936a-a2d0dce356b1`). Receipts are under the corresponding
  `output/app-quality-release/reviewed-dose-<id>/receipt.json` directories.
- **195** focused regressions across seven suites, plus **7** new mapped-reader
  tests pass. Full TypeScript check and scoped ESLint pass.
- Independent pre-apply review found and resolved copied SQL dollar-quote/regex
  corruption, an ambiguous variable and a missing evidence-reader integration.
  Independent pre-apply **120 tests** pass. PostgreSQL success above supplies
  runtime evidence beyond static review.
- Final independent review: **107 tests** pass; applied hash and the 137-check
  receipt verified, no material blocker. Its minor fixture-fidelity suggestion
  was applied: mapped-reader feedback now uses the real version-2 provenance
  envelope with version-3 completion. All seven reader tests still pass.

## Resolved verification failures

No SQL repair or replay was needed after migration application. First local run
`1af53199-c58f-4e7b-ac44-3b58b178e868` stopped after 112 checks because the source
cutoff preceded a just-saved completion's database timestamp. The test now uses
the existing bounded receipt-clock wait. Second run
`590d7fc4-0188-4870-ae0a-2ce50d4b7c92` stopped after 75 checks because the 50 ms
expiry-test cushion did not cover Podman/host clock lag. The test waits through
the fixture's five-second clock bound. Production freshness checks are unchanged.
Failed receipts and synthetic records remain. The new reader test's first run
used invalid synthetic session IDs and an excessive today-context window;
valid UUIDs and the supported seven-day window corrected the fixture.

## Remaining scope

Same-week continuity is verified locally. Next-week date/profile/sequence
reconciliation and application/server issuance still need integration. HTTP/UI
capture and proposal lifecycle, W10, P0/P1 and numerical activation remain separate
unfinished gates. Existing schema-1 issued retries remain readable; new issuance
needs a current schema-2 registration. No hosted changes, paid model calls,
numerical activation, commit or push occurred.
