# W1 data-only exercise signal storage

Implemented locally on the isolated `codex/data-to-personalized-coaching` worktree. This slice adds explicit exercise reports; it does not import numerical progression, load trials, RIR conversion, or policy selection from the experimental signal branch.

## Changed files and contract

- `supabase/migrations/20260918011000_session_capture_signals.sql`
- Identical mirror: `docs/migrations/session-capture-signals-migration.sql`
- `test/database/session-capture-signals.test.ts`

`coach_session_signals` stores the authenticated owner, prescribed session, program, accepted plan version, request identity, explicit signal, server-derived exercise snapshot, fixed `session-capture-1` policy version, and capture time. Composite foreign keys enforce consistent ownership and relationships across session, plan and program. Account deletion follows the existing owned cascade.

The table enables and forces RLS. Authenticated users can read only their rows and cannot insert, update or delete them directly. Public, anonymous and service-role table/function defaults are revoked. The authenticated `record_coach_session_signal(uuid,text,jsonb)` RPC uses an empty search path, derives the owner from auth, locks the session and program, checks accepted active rolling-plan state, resolves exactly one exercise, and derives its snapshot. No client snapshot, owner, numerical policy or computed recommendation is accepted.

Signal schema 1 requires exercise identity, `ratingScope` (`hardest_set` or `effort`) and `workStatus` (`as_planned`, `changed`, `unsure`). RPE/scale, exact actual-work fields, stop and note remain optional. RPE/load require their explicit scale/unit partners; rep/set counts must be integral; all quantities have the agreed finite bounded ranges. An omitted stop is unknown, and explicit zero quantities remain zero. Reported effort never creates session-RPE observations.

The request key is scoped to user and payload-matched. Exact replay returns the original row before terminal or changed-plan checks; a changed payload/session conflicts. Fresh signals after completion or against stale/unaccepted plans fail. Session locks serialize capture against completion. A check-in trigger rejects `as_planned` completion when saved actual amounts, changed work or a stop report require an explicit modified/stopped summary. The trigger applies to both inserts and updates and lets the surrounding atomic completion roll back all canonical side effects on failure.

## Executed verification

```powershell
npm test -- --root . --exclude '**/.worktrees/**' test/database/session-capture-signals.test.ts test/database/optional-feedback.test.ts
```

Latest result: **51 tests passed in two files**: 45 signal tests plus the neighboring feedback migration's six tests. Signal tests execute PGlite PostgreSQL, the existing coach migration chain, runner/link repair, logging receipts, preferences, the new optional-feedback migration, and the new signal migration. They do not mock the SQL transition.

Covered: owner and anonymous boundaries; service-role grant removal; FORCE RLS; same-owner composite references; exact snapshot and scope; no fabricated observations/workouts; replay after completion and changed plan; mismatched key reuse; terminal/stale/unaccepted rejection; numeric/type/unknown-field rejection; omitted versus zero/false; actual-work completion guard and transactional rollback; successful modified/stopped completion; account deletion.

First test attempt: 35 passed, nine failed because the new test fixture used `fieldProvenance` shorthand instead of the agreed nested `provenance` field. Corrected the fixture after inspecting the current parent-owned migration. The next run passed all 44 then-existing signal tests. Independent review requested explicit service-role revokes to avoid Supabase default-privilege inheritance; added them and a grant regression, yielding 45 signal tests and 50 combined. A subsequent neighboring legacy-version repair added one feedback regression, and the combined 51-test rerun passed. No unresolved repeated-failure blocker remains in this slice.

## Review and limits

The parent independently reviewed signal ownership, replay and data-only policy boundaries and requested the service-role hardening above. This agent separately reviews the parent-owned optional-feedback SQL in [w1-database-review.md](./w1-database-review.md).

PGlite runs transactions on one local engine. These checks prove serialized transitions and rollback behavior; they do not reproduce simultaneous independent PostgreSQL connections, production lock contention or live Supabase deployment. The matching session locks were source-reviewed, and both capture-before-completion and completion-before-new-capture orders are exercised. W9 still needs integrated concurrency/browser/source-adapter coverage. App/API wiring and optional-field UI are owned by the W1 app agent; this database slice alone does not close W1.

No production migration, real athlete record, provider call, commit or push occurred. Migration order is optional feedback first, session capture signals second; later W7 invalidation triggers must include the signal fields actually consumed by its enabled rules.
