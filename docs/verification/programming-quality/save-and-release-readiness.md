# Programming-quality save and release checkpoint

Date: 2026-09-21 (America/Chicago). Tracker: `Fitness-Tracker-i40.9`.

## Decision

Save the accumulated implementation, tests, research, review decisions and
handoff as a local Git checkpoint on `codex/programming-quality`.
**Not ready for production deployment.** Saving this checkpoint does not close
the full programming-quality plan or authorize a push, migration or deployment.

Remote `main` was read with `git ls-remote` and remains
`f123aa8aa848716e894ea7bec340d693995e4b36`, the checkpoint's base. No remote
`codex/programming-quality` branch was returned. A local commit is not an off-device
backup. Root and other dirty worktrees are outside this checkpoint and preserved.

## Current verification

| Check | Result and limits |
| --- | --- |
| Full Vitest regression (`node node_modules/vitest/vitest.mjs run --root .`) | 3,450 passed, 8 failed, 19 skipped; 307 files passed, one failed, six skipped. All eight failures are in `test/database/engineering-boundaries.test.ts`. This is not a green full regression. |
| Production build (`node node_modules/next/dist/bin/next build`) | Passed, including type validation and 85 static pages. Used CI-style placeholder Supabase URL/key; establishes buildability, not hosted integration. |
| Full lint (`node node_modules/next/dist/bin/next lint`) | Passed with the existing `app/v2/page.tsx:266` hook-dependency warning. Next reports its lint deprecation and nested-worktree root warning. |
| Whitespace and scoped file inspection | Passed; no dependency or lockfile changes. Common private-key/token pattern scan found no matches in changed/new files; this is a limited pattern check, not a comprehensive security certification. |
| Independent release review | Confirmed migration dependency and old/new application compatibility constraints below. No new implementation defect identified by that bounded review. |
| Hosted/visual/clinical quality | No hosted migration, live athlete validation, new browser visual review or physiological-policy validation performed. |

Node is 24.13.1. The worktree uses an existing dependency junction whose lockfile
hash matches this checkout. No dependency installation occurred. Earlier focused
receipts remain historical evidence and do not replace the full-run result above.

## Regression failure assessment

An independent read-only investigation found an inherited fixture clock mismatch.
`engineering-boundaries.ts` captures `recommendationScope(0)` while seed SQL uses
`CURRENT_DATE`. At the check, Node's UTC date was September 22 and PGlite's date
was September 21 (`Etc/GMT+6`). The seed therefore created sessions outside the
reader's requested day. All eight plan cases failed before their intended
boundary assertions with `Materialized facts did not produce a rule candidate`
and `sessions: []`.

The relevant fixture, seed and recommendation reader sources are unchanged from
`f123aa8`; that commit's full scenarios were not separately rerun. No application
fix is indicated by this evidence. `Fitness-Tracker-i40.10` tracks making fixture
dates explicit and obtaining a green focused rerun. No test or assertion was
removed or weakened to create this checkpoint. This was one full-suite attempt;
the subsequent source/clock investigation was read-only, with no retry or remedy.

## Deployment prerequisites

The new weekly creation, conversion and review routes unconditionally call
`get_coach_context_revision`. Without
`20260921010000_coach_proposal_context_revision.sql`, those operations fail closed
with 503. Existing feature flags do not guard this dependency.

The migration also immediately rejects unstamped rolling proposals and reviews.
Applying schema first while the old app continues writing is not a zero-downtime
compatibility guarantee. A tested cutover must coordinate schema and application,
and rollback must retain a compatible application or an explicitly reviewed
database recovery procedure. Old pending unstamped drafts need recreation;
accepted plans retain their authority.

Release preparation still requires target-specific migration ledger/prerequisite
readback, backup/recovery verification, isolated canary verification, real
PostgreSQL concurrency checks, and browser verification of the changed Program
flow. The older A0 manifest in the personalized-coaching worktree supplies the
starting procedure; its hosted inventory is historical and was not refreshed in
this checkpoint. A Preview sharing production Supabase is not an isolated canary.

The six qualitative coaching judgments remain accepted. They do not approve
numerical thresholds. P0 calibration/holdout, P1 continuity, P3 runtime strategy,
broader P4 rules, P5 quality comparison and P6 activation remain tracked separately.
`initialDosePolicy` remains false. Those product-completeness limits are distinct
from preparing a guarded release of the implemented protective changes.

## Saved scope

The checkpoint includes application changes, the new migration, ADR-0022 through
ADR-0027, both plans, synthetic evaluation fixtures/reports, six recorded review
decisions, implementation receipts, tests/scripts, and the current handoff.
Generated build/cache files, credentials, dependency directories, raw temporary
logs and unrelated worktrees are excluded. Beads task state remains in the local
project database; no Dolt remote sync or Git push is part of this checkpoint.
