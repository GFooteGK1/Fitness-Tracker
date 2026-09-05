# ADR-0008: Consistent logging and accepted-plan reads

Date: 2026-09-04

## Decision

Keep Next.js and Supabase. Extend the existing transaction and explicit
acceptance patterns across logging. The accepted plan remains the only source
for the Coach program card and trainer programming context.

## Alternatives

1. Patch each endpoint separately. Small initial diffs, but retries, dates, and
   failure semantics would continue to drift.
2. Introduce a separate event/queue service. Strong orchestration options, but
   unnecessary infrastructure and migration cost for the current application.
3. Use shared application boundaries and additive PostgreSQL transactions.
   Selected: fits the existing coach architecture and supports executable tests.

## Delivery plan

The local Beads epic `Fitness-Tracker-j7g` owns execution status.

First, make logging replayable and ensure workout/block writes commit together.
Keep request identity stable across interrupted responses and preserve athlete
dates. Report failure explicitly rather than returning an unverified save claim.

Second, project today's accepted sessions from the existing coach runtime
context for both UI and agents. Preserve stored legacy prescriptions, show
completion status, distinguish no plan from unavailable data, and link back to
Program for execution. No new navigation surface or prescription generator.

Third, execute migration/transaction tests and a focused browser journey in CI.
Triage dependency advisories and prepare required-check configuration.

## Acceptance evidence

- Replaying a request creates one canonical meal/workout; changed payload reuse
  fails. A failed block insert leaves no partial workout.
- Athlete-local date boundaries survive UTC midnight and retry.
- Coach and trainer read the same accepted session and terminal state as Program.
- Tests execute database behavior, including tenant isolation, and browser
  recovery rather than relying only on mocks or SQL text matching.
- Full tests, typecheck, lint, build, and focused browser proof pass.

## Release and rollback

No production migration, deployment, commit/push, or repository permission
change is implied by local implementation. Prepare exact migration ordering and
required GitHub checks for release approval. Apply additive schema before code.
Rollback application code without deleting user data or accepted plans.

## UI brief

Retain the existing Coach card styling. Show the accepted session title, status,
and a touch-friendly Program link. An empty day, missing plan, or failed read
must not masquerade as a different workout from Google Sheets. Preserve the
existing Program execution workflow and explicit plan acceptance.
