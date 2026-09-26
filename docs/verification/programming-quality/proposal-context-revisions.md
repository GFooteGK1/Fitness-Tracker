# Proposal context revision verification

Date: 2026-09-21. Local implementation of `Fitness-Tracker-i40.3.1`.

## Behavior

Initial rolling proposals, legacy-to-rolling conversions and weekly reviews now
capture an owned context revision before reading planning inputs. Reviews retain
that revision in their rationale, and proposal input snapshots retain it separately
from accepted profiles. A proposal made from a saved review copies the original
review revision. It cannot acquire a fresh stamp for an old decision.

The additive migration checks revisions inside review/proposal persistence and
first acceptance. Source writes advance the same per-athlete row in their own
transactions. The check takes a nonwaiting shared lock after existing source
checks; a busy or missing revision row fails closed. Stale writes roll back.
Accepted replay and accepted prescription JSON retain their existing behavior.
Referenced training intent also receives an identity, content and lifecycle check.

The revision covers memories, workouts, checkins, strength assessments,
observation groups/values, imports and execution changes on accepted/superseded
sessions. Generated proposals and sessions do not invalidate their own inputs.
These are all currently consumed training source tables; the counter deliberately
does not mean only the selected records or date window changed.

On readback, changed or unstamped reviews become `context_changed`, and stale
pending proposals disappear from actionable controls. The page offers a fresh
review and resets old request keys. Fresh review successors expire stale pending
replacements and free their window. A fresh initial request can create a new
draft; its older draft remains history and cannot be accepted. Intent conflicts
explicitly say that refreshing an old review is insufficient.

## Verification

Final combined regression: **426 tests in 30 files passed**. Full TypeScript,
focused ESLint and whitespace checks passed. The original 24-case baseline report
remains frozen. Existing Vite/nested-mock warnings are unchanged and nonfatal.

The executable PGlite suite applies the migration twice and exercises real SQL
RPCs, triggers, rollback, RLS and privileges. Its 15 tests cover new history,
correction/deletion, intent supersession/withdrawal/expiry, source changes between
read and save, stale first acceptance, fresh recovery, forged/missing stamps,
cross-owner isolation, accepted replay and unchanged accepted JSON.

Application tests cover capture-before-read, revision-unavailable failure,
snapshot propagation, saved-review stamp preservation, HTTP conflicts, owned
readback parity and Program recovery controls. Independent review ran 84 focused
tests and found no remaining blocker to this bounded mutation-fence slice.

These are local synthetic checks. PGlite does not establish multi-session
PostgreSQL contention behavior; a real database concurrency check remains release
evidence. UI coverage is component behavior, not browser visual QA. No migration
was applied to a hosted database, and no deployment or athlete-data mutation ran.

## Remaining boundaries

`Fitness-Tracker-i40.3.2` owns reconciliation of changed intent with a new proposed
direction. Ordinary continuation still preserves its accepted profile and fails
closed when that intent no longer matches. The mutation check does not itself
choose an updated strategy, reconcile competing goals or validate a numerical
policy. Full P2 and programming quality remain incomplete.

Time alone does not increment the revision. Referenced training-intent expiry is
checked separately; time-only expiry of other memories is not covered by this
mutation fence. The readback marker `latestAthleteContextReconciled: false`
remains intentional even when revisions match. `initialDosePolicy` remains false.

Application rollout requires this additive migration first. Old unstamped rolling
drafts require recreation. Source revisions and generated plan fingerprints do
not provide physiological validation or qualified review labels.
