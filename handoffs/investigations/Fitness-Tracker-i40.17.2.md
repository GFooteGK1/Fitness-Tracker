# Supervised lifecycle enforcement verification

Issue: Fitness-Tracker-i40.17.2. Workspace: `.worktrees/programming-quality`.
Owner: implementation lead. Local implementation in progress; no hosted changes.

September 29 — receipt adapter typecheck, attempt 1: 15 runtime tests and lint
passed. Full nonincremental TypeScript reported TS2339 on `sessionId` and
`completion`: grouping issue/accept into one union branch prevented exhaustive
discriminant narrowing. Split them into distinct operation branches with exact
identity types. This changes static representation, not the RPC contract.
The patch tool reported a context error, but direct readback confirmed the type
fix had landed; the missing investigation file was added separately.
Next verification: rerun typecheck and the focused adapter suite after this fix.

Resolved: nonincremental TypeScript passed after the discriminated-union fix.
Receipt recovery plus the new unwired review HTTP factory pass 26 focused tests
in both implementation and independent review. Scoped ESLint passes. SQL
enforcement is still being implemented and reviewed; these adapter checks do
not establish database enforcement or hosted behavior.

Early migration review identified initial-anchor reactivation/NULL active-pointer
and execution-slot guard gaps. Those are implementation findings, not a tested
release. Builder is addressing them before the lifecycle integration run.

SQL cycle attempt 1: the shared deferred trigger referenced `NEW.program_id`
through a CASE expression when running for `training_programs`, whose identity
column is `id`. PostgreSQL still rejected the unavailable record field. Builder
changed the table-dependent projection to JSON; the actual two-cycle test then
passed, including approvals, acceptance, source-changing set corrections,
completion and historical receipt recovery.

SQL fixture follow-up: three of four checks passed. A revocation test reused an
already-issued registration with a different request key and expected 55000;
the earlier identity-conflict contract correctly returned 22023. Builder is
separating that identity-conflict case from an unissued-candidate revocation
case. This does not justify weakening either database check. Amendment,
direct-write, ACL and final independent review checks remain.

Builder's shell append to this investigation was denied by a file ACL; the lead
recorded the evidence through the authorized patch tool. No permission changes
or live database writes were made.

Final implementation review: shared pause trigger initially referenced user_id
on decision rows that lack it; changed to a table-aware JSON projection. Fixture
failures caused by expected-error precedence and an overbroad canonical amendment
payload were corrected without weakening the protected contracts. Eighteen SQL
checks and independent affected suites pass; actual concurrency remains unproven.

Issuer review found existing owned legacy registrations could reach the shared
SQL issuer without proving supervised lineage. Added a bounded candidate identity
check before fresh issuance and a nonpilot refusal test. Unavailable reads now
return retry-required instead of directing creation of a new candidate. Eighteen
issuer tests pass independently. No mutation retries or request replacements
were introduced. Exact private draft retention is a follow-on change to the
previously reviewed foundation; its old recorded hash remains historical.
