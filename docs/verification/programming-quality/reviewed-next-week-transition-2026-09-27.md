# Reviewed next-week transition — local verification

Date: September 27 Chicago / September 28 UTC, 2026.
Canonical task: `Fitness-Tracker-u5l.6.11` remains in progress.

## Behavior

An explicit trusted `next_week` operation advances the accepted Monday–Sunday
window by seven calendar days and the sequence by one. It copies the complete
profile with only `startDate` changed. The trusted recipe must already match that
dated profile; moving the calendar supplies no new dose or coaching authority.
Same-week remains the default. Transition snapshots contain only exact window
fields, profile hashes and the accepted base identity.

Next-week execution receives fresh session roots. Prior completed/skipped rows
stay unchanged; planned sessions without reports remain unreported history.
Begun unresolved work blocks the transition, including with a freshly matched
source binding. SQL independently checks the profile, dates, sequence, complete
history disposition and new-root manifest at issuance and acceptance.

Migration `20260928050000_reviewed_next_week_transition.sql` was applied once to
the existing synthetic loopback database. No reset, bootstrap or migration replay.
SHA256: `E634A3D244B4CE460CDD0BC4B15C2FCDE6D2F0AF2598DB325D401D2C69F44ED1`.
Apply log: `output/app-quality-release/reviewed-set-migration-8dd76415-27f3-43fc-988e-c2873ee97911.log`.
The migration also restores one-second function-local lock limits lost by earlier
function replacements. `pg_proc.proconfig` readback confirms the limit on
registration, issuance, set recording and completion.

## Verification

- Real local Auth/PostgreSQL: **174 checks pass**. Receipt:
  `output/app-quality-release/reviewed-proposal-3e81e32d-ca7d-4049-b331-c8d00fe11833/receipt.json`.
- **189 regressions across eight suites pass**: week transition, authenticated
  dose context, continuity, mapped readers, rolling week, evidence fetching,
  athlete context and reviewed-set database checks. Full TypeScript check and
  scoped ESLint pass.
- Independent reviewer reran **105 focused tests**, inspected the final receipt
  and verified the migration hash; no material blocker remains for this slice.
- Receipt proves unchanged prior execution rows, five new empty planned roots,
  atomic active-window advancement, immutable original profile/intent, prior
  execution receipt replay, owner isolation and malformed transition rejection.
- Fresh-source begun-work rejection passes. The new-set/acceptance race cannot
  commit both operations; both may fail with a bounded conflict. This is not a
  guarantee that exactly one operation succeeds.

## Resolved failures

The first local attempt (`1e146db5-91bc-4dfa-9d8f-7552e86e509f`, 19 checks)
correctly failed SQL validation because an object spread included compiler
context/direction in the target window. Explicit field projection fixes the
packet; exact-key tests cover it. No SQL repair or replay was needed.

An intermediate run (`c5e82656-dabd-4cdb-b80c-efcef5eb86df`) passed 161 checks.
An expanded run (`aea2a0cd-8bfa-432b-be04-e4c7a3791f7c`, 169 checks) encountered
the evidence guard after a counterfactual fixture created a second same-day
completed exposure. That counterfactual now seeds only started work. Production
evidence checks remain unchanged. Earlier unit-test date assumptions were
corrected to the fixture's August 3/10 windows. All receipts are retained.

## Remaining scope

Application/server issuance integration is next, followed by HTTP/UI lifecycle
and W10 verification. Synthetic dated recipe variants test transport semantics;
they do not represent new human coaching approval. W5 and the broader plan stay
open. Numerical activation remains disabled. No hosted changes, deployment,
commit or push occurred; this implementation remains local and uncommitted.
