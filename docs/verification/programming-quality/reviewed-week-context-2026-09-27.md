# Authenticated complete reviewed-week binding

Date: September 27, 2026 Chicago / September 28 UTC.
Canonical child: `Fitness-Tracker-u5l.6.6`; parent W5 remains in progress.

`reviewed-week-context-server.ts` binds the complete rolling-week compiler to
the existing authenticated source adapter. A caller selects only an ID. The
server-owned registration fixes the source scope and digest, complete recipe,
reviewed schedule, factual context, target dates, sequence and direction.
Nested authority is cloned before the first authentication await. Selection
requires one matching authenticated owner; compilation uses the freshly read
accepted profile. Changed setup needs reconciliation/review, not silent reuse.

The complete result preserves all five sessions, ordered preparation, ramps,
work, monitoring, RPE, rests, timing and changed spacing. The source packet hash
is separate from the recipe's reviewed-facts hash. Neither is an acceptance
credential. Read-time freshness does not close the transaction race between a
read and future save; atomic acceptance remains required.

## Verification

- 153 tests passed across authenticated context, reviewed rolling compiler,
  offline week/session and weekly API suites, excluding retained `output/**` copies.
- Full `tsc --noEmit --incremental false` and focused three-file ESLint passed.
- Independent reviewer ran 81 adapter/compiler tests and found no blockers.
- Existing loopback Auth/PostgreSQL harness passed both integration cases.
  Session run `7af8657d-70d7-4ef7-be95-969b45651c59`: 24 checks.
  Whole-week run `c306219c-6041-4ff3-b08f-c86525c8b715`: 26 checks.
- Whole-week proof includes exact plan hash equality, unchanged context revision,
  real RLS isolation, canonical capture/amendment, correction-triggered source
  invalidation, and unchanged accepted intent. Receipts are under
  `output/app-quality-release/reviewed-dose-<runId>/receipt.json`.

The harness seeds a new synthetic accepted base directly; it does not prove the
acceptance workflow or session-storage schema. Only fixed loopback targets are
allowed. No credentials are included in receipts. No source or session is saved
by the new adapter itself. Synthetic fixtures remain available for inspection.

## Remaining boundary

No HTTP generation route, production registry, database migration, reviewed
session serializer, per-set logging/completion, atomic acceptance, or activation
was added. `initialDosePolicy` remains false; output is non-persistable and not
runtime eligible. Canonical movement/equipment mapping, storage/capture contracts,
atomic correction-invalidated acceptance, W10 and release gates remain open.
Changes are local and uncommitted. No accepted coaching review was repeated.
