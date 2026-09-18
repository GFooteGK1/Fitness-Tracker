# W0 reuse and baseline source audit

Date: 2026-09-17. Implementation base: `61d04df9dad3dfe88a9594fff28be06a72899741`.
Scope: source audit only; no source-worktree mutations, model calls, database writes, commits, or production verification.

The implementation checkout is `C:/Dev/Personal/repos/Fitness-Tracker/.worktrees/data-to-personalized-coaching`. Paths below are relative to it. `experiment/` means the sibling `../coaching-layer/`; `signals/` means sibling `../rolling-weekly-coach/`. The exact source anchors describe the audited state, before implementation edits.

## Sources and identity

`git worktree list` confirms both experimental checkouts are at commit `422fd3a5998ae72942e26171471c8d1826ac8272`. Their worktree contents differ from that commit: coaching-layer has extensive modified and untracked experimental code, while rolling-weekly-coach has separate playbook edits and an untracked Supabase temporary directory. Neither is an implementation base. Git initially denied sibling status reads for dubious ownership; a command-local `-c safe.directory=<exact sibling>` allowed the read without changing configuration. Global ignore-file permission warnings did not prevent the status result.

Audited dirty-source SHA-256 values, in filename order:

| Experimental file | SHA-256 |
| --- | --- |
| `app/lib/coach/performed-dose-evidence.ts` | `3ED06767B0BD52A7513786F3779F8E7987667B56D6225185FFE80FD04A9663DE` |
| `app/lib/coach/performed-dose-review.ts` | `AF05881BC04EFAE055C4E412974A56AE123392BB5EAEAFBBB4F97FA63AD8EFD6` |
| `app/lib/coach/prescription-basis.ts` | `971EA588BCE70579BB760AEF3F1BEFD66F4861FB2C6CCA85E4969A61EE56DD8F` |
| `app/lib/coach/execution-priority.ts` | `8179A25DE908D00BDBA925BCAF910BE9C356A6A4043028AB2237010705F8CA89` |

Read the current architecture map and ADR-0003, ADR-0006, ADR-0007, ADR-0008, ADR-0010, and ADR-0014. The controlling boundaries are canonical owned execution, purpose-scoped evidence, immutable accepted plans/reviews, explicit confirmation/correction, and separate acceptance. Current exercise preferences explicitly distinguish omitted, none, withdrawn, and unavailable reads; reuse must preserve those semantics.

## Reuse decisions

| Candidate and exact source anchors | Decision | Dependencies and integration conditions |
| --- | --- | --- |
| `experiment/app/lib/coach/performed-dose-evidence.ts:1`, `:41`, `:86`, `:118`, `:153` | Port and adapt as **shadow only** in W4. | Only runtime imports are `MOVEMENT_CATALOG` and `stableStringify`. Retain exact/bounded/unknown quantities, source paths, tenant checks, timestamp cutoff, conflicting-ID rejection, distinct same-day sessions, preparation precedence, and literal `numericPolicyEligible: false`. Update completion recognition for the new feedback contract without manufacturing confirmation. No prompt, compiler, policy, numerical coverage, or write-path consumer. |
| `experiment/app/lib/coach/performed-dose-review.ts:1`, `:14` | Port and adapt as **shadow only**. | Depends on normalizer output and a type-only `RollingWeeklyPlanDraft` import. It compares field bounds, not tolerance, protocol equivalence, or recommended dose. Retain owner check and withheld comparison for uncertain role/completion. Extend tests for stopped/modified work, unilateral conventions and unsupported units. |
| `experiment/test/coach/performed-dose-evidence.test.ts:23`, `:37`, `:47`, `:73`, `:101`, `:122`, `:152` | Adapt relevant fixtures and invariants. | The compiler-invariance case imports experimental strategy/brief infrastructure. Replace that dependency with the current deterministic compiler and fixed inputs; do not port model infrastructure to make a shadow test compile. Existing inspected cases are development evidence, never unseen holdouts. |
| `experiment/app/lib/coach/prescription-basis.ts:1`, `:7`, `:27` | Adapt honest provisional disclosure. | Its `CoachingBrief` type belongs to unmerged `coaching-strategy.ts`. Use current typed profile/evidence instead. The legacy `recordedWorkForExercise` only sees `movements`; do not reuse it as the canonical reader for `exercises`. Familiarity cannot claim calibrated sets/reps, load, effort, exposures or whole-week tolerance. |
| `experiment/app/lib/coach/execution-priority.ts:1`, `:8`, `:13`, `:24`; `experiment/app/lib/coach/session-composer.ts:74`, `:117` | Adapt bounded realization in W6. | Experimental `STRENGTH_ALLOCATION_FOCI`, strategy allocation menus, composer parameter and rolling-plan fields form a dependency set. Port only supported ordering/realization with current schema, preferences and validators. Mandatory precedence wins; verify final work order, matching preparation, role, title, dose/rest/stop bounds, exposure count and time budget. Missing or blocked focus must stay unavailable/blocked. This is not a general optimizer. |
| `experiment/docs/coach/execution-priority-implementation.md:1` | Reuse limitations and regression ideas, not reported verification as current proof. | Prior 170-test and provider evidence describes a different dirty worktree. Its frozen-choice replay is version-adapted compiler evidence, not live-model invariance. Coordinate the diversified preparation dependency `Fitness-Tracker-f4k`; do not reuse inspected paid archives as holdouts or reuse spending authority. |
| Commit `422fd3a`; `signals/app/lib/coach/session-signals.ts:9`, `:59`, `:68`, `:80`; `signals/app/lib/coach/session-signal-summary.ts:1` | Adapt capture, explicit scope, actual-work merge, targeting and retry safeguards. | Keep hardest-set/effort/session distinctions. Actual work is optional and only explicitly supplied fields enter the editable completion. Do not let inferred repetitions, unreported sets, general RPE or an old default become observations. Inspect UI, API, completion guard, saved evidence readers and SQL together. |
| `signals/docs/coach/signal-implementation-2026-09-10.md:18`, `:39`; `signals/app/lib/coach/session-signals.ts:59` and weekly numerical rules | **Exclude activation** of new numerical signal rules. | Qualified protocol review and an athlete walkthrough remain gates. A two-exposure rule, RIR conversion or bounded requested-load rule is not validated merely because engineering tests pass. Safe evidence targeting can be adapted independently. Keep new numerical rule classes disabled until their specific approval; this gate is separate from qsp initial-dose review. |
| `experiment/app/lib/coach/initial-planning-context.ts:25`, `:39`, `:57`; current `app/lib/coach/exercise-preferences-context.ts:8`, `:34` | Adapt history into current preference boundary in W4. | The old query selects only ID/date/blocks and bounds creation time, so it cannot establish historical values after correction. Add owner, event/capture/update/revision source identity and snapshot semantics. Keep missing, partial retrieval and database outage distinct. The current preference adapter remains authoritative for explicit-none/withdrawal/avoidance and ordinary continuation. Never replace it wholesale. |
| Initial-dose policy draft; TypeSafe/Jev, compact prompts, specialist experiments, paid archives | **Exclude numerical activation and unrelated infrastructure**. | qsp and W10 qualified-review gates remain. No production dependency or provider calls needed for this reuse. Preserve original artifacts unchanged. |

## Baseline source reproductions

These are deterministic source-path reproductions and existing-test gaps, not claims that new runtime tests have run. W0 executable regressions must independently freeze these behaviors before implementation. All examples are synthetic.

### Initial history is empty

1. Start with valid `test/coach/complete-intake.test.ts:8` input and call `buildProgrammingProfile(validated.value, assessments)`.
2. `app/lib/coach/complete-intake.ts:154` unconditionally sets `asOfDate: null`, `lookbackDays: 0`, `completedSessionCount: 0`, and empty movement/dose arrays. The constructor has no history argument.
3. Current initial weekly route `app/api/coach/weekly/route.ts:135` applies current preferences to that profile; it does not hydrate completed history.
4. `app/lib/coach/weekly-coverage.ts:447` looks up recent dose; `:452` returns the policy minimum when absent.

Expected repair: bounded factual history distinguishes no history from missing/unavailable retrieval; supported familiar movement choices may differ while numerical coverage remains provisional. Do not turn sparse raw set totals into reviewed dose.

### Same domain loses distinct outcome semantics

1. Use primary strength goal “Bench press 100 kg” and secondary strength goal “Complete five pull-ups.” `app/lib/coach/complete-intake.ts:81` rejects it solely because both domains are strength. Existing `test/coach/complete-intake.test.ts:62` asserts the rejection.
2. Run two separate primary goals in one domain through the current constructor. `app/lib/coach/programming-schema.ts:512` chooses kind by domain, creates a fixed horizon and `target: null`; only statement differs.
3. `app/lib/coach/adaptive-plan.ts:345`, `:388`, `:413` choose hypothesis, scheduled assessment and expected signals from `DOMAIN_EVALUATION_SPECS[goal.domain]`. They cannot distinguish bench from pull-up outcomes or 5 km from another running protocol merely from the statement.
4. `app/api/coach/weekly/review/route.ts:142` selects `goals[0]`, so additional goals do not each receive a recorded review.

Expected repair: separate stable outcome identities, compatible baseline/protocol and goal demand mappings; retain multiple outcomes in one domain, with explicit unsupported/unconfirmed states. Equivalent wording should be inert. One goal’s attainment cannot complete another goal/event or substitute proxy progress for transfer.

### Dose change can target unrelated first assignment

1. The existing increasing-strength-series fixture at `test/coach/weekly-review.test.ts:122` reaches `adjust_dose`, but asserts only a positive change and separate acceptance.
2. `app/lib/coach/weekly-review.ts:170` passes evaluator/currentWeek/execution into `mapDecision` without an evidence-target mapping.
3. `:448` calls `findDoseChange(currentWeek, 'adjust_dose')`; `:513` accepts only plan and action. It ranks assignments by priority and ID at `:520`, then returns the first dose-compatible assignment within bounds at `:539`. It never checks outcome, movement, source observation, or reviewed goal.
4. Thus a synthetic plan with a lexicographically first eligible squat assignment and qualifying bench evidence can choose squat; changing only the unrelated first assignment ID can change the selected target while evidence remains identical.

Expected repair: map explicit compatible evidence to relevant assignments before selecting a dose; hold/collect a signal for broad ambiguous evidence; evaluate every goal and reconcile shared-demand conflicts. Keep the existing action gate, full-plan validation and separate acceptance. A confirmed target match alone does not approve new numerical policies.

### Optional feedback currently fabricates certainty

`app/program/today-session-card.tsx:55`, `:60`, `:61` initialize pain none, RPE 7 and energy okay. Completion SQL at `supabase/migrations/20260904023000_fix_atomic_session_workout_link.sql:67` requires energy/pain, and `:361` creates session-RPE observation identity. UI changes alone would leave reachable SQL and legacy feedback readers inconsistent. W1 must preserve unknown versus explicit none and create an RPE observation only for an explicit session report.

## ADR numbering and migration integration

Current ADR-0008 is `ADR-0008-app-quality-and-canonical-logging.md`; the signal branch's ADR-0008 is `ADR-0008-exercise-signals-and-bounded-load-trials.md`. Current ADR-0009 daily navigation also collides with experimental ADR-0009 coaching strategy. Current and experimental ADR-0014 concern preferences but are separate copies. Experimental ADRs extend through 0020. Reserve **ADR-0021** for this epic's contract; link reused experimental decisions by full filename/source rather than silently importing or renumbering current accepted documents.

Latest migration on audited base is `20260915220000_exercise_preferences.sql`. New slices must use later unique timestamps. Completion migration chain is:

1. `20260729182500_coach_execution_feedback.sql` defines legacy `record_coach_session_result`.
2. `20260730130953_coach_workout_runner_v0_5.sql` adds runner behavior and must be checked for reachable compatibility paths.
3. `20260901170000_atomic_coach_session_completion.sql` defines `record_coach_session_result_v2`.
4. `20260904023000_fix_atomic_session_workout_link.sql` replaces v2 and wins on current base. Preserve its canonical link transaction and replay contract.
5. `20260904120000_logging_receipts.sql` owns existing canonical logging request identities; W2 must extend this ledger, not duplicate it.
6. `20260915220000_exercise_preferences.sql` supplies the current memory correction/whitelist and preference safeguards; W3 must extend the current definitions.

The experimental `20260910120000_coach_session_signals.sql` is absent from the base. If capture is ported, create a new additive, mirrored migration after current main. Its `record_coach_session_signal` function and `guard_coach_signal_completion` trigger (`:121`, `:137`) depend on the accepted prescribed session and coach check-in shape. The trigger rejects as-planned completion when actual/deviation evidence requires a modified summary. Reconcile with v2 optional feedback and corrected canonical workout revisions; do not merely copy a UI panel or apply the old timestamp out of order.

One migration owner must coordinate feedback compatibility, provenance/drafts/revisions, confirmed intent/baseline memory, then recommendation invalidation after source shapes stabilize. Execute the composed chain against local SQL, including legacy and new RPCs, grants, FORCE RLS, owner-consistent foreign references, conditional observations, frozen-payload replay, stale revisions, completion/feedback races and rollback. The old signal verifier uses synthetic prerequisites and explicitly does not prove the whole chain.

## Authority risks and remaining evidence

- Reading current preferences or corrected workout values into old accepted snapshots would change history. New evidence affects a new proposal; old explanations retain the exact saved inputs.
- A completion receipt confirms its own payload/session, not arbitrary revised canonical blocks. Changed revision, modified work, contradictory receipt or absent timestamps needs an explicit unresolved/snapshot state.
- A normalizer’s exact numeric field is not proof of completed working dose, physiological tolerance or complete weekly logging. Roles, units, unilateral conventions, actual completion and coverage remain independent facts.
- Provider/paid archive claims and old local suite totals are historical context only. This audit performs no paid/model work and claims no qualified policy review.
- Main features to preserve include preference withdrawal/explicit none, canonical workout linkage/receipts, legacy accepted-plan reads, persistent Log access and explicit plan acceptance.

This document closes only the bounded reuse/source audit. The W0 package still needs its contract ADR, executable baseline regressions and distinct development/held-out fixtures; later packages must supply current integration, database and visual verification before readiness claims.
