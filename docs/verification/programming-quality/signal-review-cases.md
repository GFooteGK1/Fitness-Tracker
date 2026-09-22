# Signal analysis: six worked evidence-to-action cases

Reviewer: Greg Foote. **All six qualitative coaching responses were agreed in the phone-readable conversation review on 2026-09-21.** See [recorded decisions and remaining method questions](signal-review-decisions.md). Numerical applicability and statistical-method validation remain open. These are synthetic observations constructed for review, not Greg's training records. They do not create a program, approve a threshold, change numerical policy, or activate a dose adapter. The original review prompts below remain for traceability; the linked decision record is the current human-review status.

The purpose is to review the analysis that already exists before choosing more rules. The [reconciliation](signal-analysis-reconciliation.md) distinguishes adaptation from initial-dose continuity. The existing [research appendix](../../../../coaching-layer/docs/coach/autoregulation-research-appendix.md), sections 1–3 and 8, explains task-specific measurement, immediate versus durable decisions, and noise. Its [signal cards](../../../../coaching-layer/docs/coach/coaching-signal-cards.md) supply SC-02 exercise-specific progression and SC-04 feasibility/cost examples, but explicitly exclude velocity prescriptions and maximal testing. Their conclusions cannot silently authorize these VBT cases. The cited literature was not re-browsed or independently revalidated in this execution.

## Actual code under test

The runner calls `evaluateAdaptation` in `app/lib/coach/adaptation-evaluator.ts`, `evaluateConfirmedOutcome` in `app/lib/coach/targeted-review.ts`, and the existing weekly compiler for the schedule case. Product strength contracts come from `buildAdaptivePlanContract` using an existing supported synthetic profile. These cases supply already-selected evidence packets: database ingestion, device validity, authorization and canonical evidence selection are outside this harness.

For VBT summaries only, the runner follows the existing `adaptation-evaluator.test.ts` pattern: clone a contract and declare velocity as a **training signal**. This harness-only hypothesis lets the existing generic evaluator calculate its statistics. It is not an accepted product VBT policy. Every VBT case also calls the real targeted-review path with the **unchanged product strength contract**. That path returns `hold_collect_more` with `outcome_policy_adapter_unavailable`. No new load/repetition/set adapter is invented.

Current implementation settings, not newly approved thresholds:

- Group samples by workout, session or observation identity into exposures. Select the best direction-adjusted value in each exposure.
- Split chronological exposure representatives into earlier and recent halves; compare their means.
- Calculate sample CV across all exposure representatives; threshold is `max(2%, min(10%, 0.5 × CV))`.
- Directional evidence is labeled supported at four exposures; variability remains provisional below six. An action still depends on semantic role, expected signals, policy and available evidence.
- Require at least two recent exposures agreeing beyond the threshold before labeling improvement or worsening. Within-exposure decay summaries use available readings.

The exact source is the constants and `summarizeSeries` implementation in [adaptation-evaluator.ts](../../../app/lib/coach/adaptation-evaluator.ts). The generated artifact retains contracts, actual source measurements, comparison modifiers, computed statistics, actions, exclusions and pending review questions. CV across a changing trend is not automatically measurement error, and this threshold is not automatically minimum detectable change or worthwhile improvement.

All four-exposure examples use August 31, September 7, September 14 and September 20, with review as of September 21, 2026. These retrospective inputs test analysis, not proof that the synthetic proposed week caused an adaptation. VBT examples declare the same floor-press variation, synthetic device, 185 lb and two performed repetitions, measured in m/s; these are scenario inputs, not training recommendations.

## 1. Same protocol: stable output versus one spike

Stable rep readings: `(0.50, 0.48)`, `(0.51, 0.49)`, `(0.50, 0.48)`, `(0.51, 0.49)`. The counterfactual changes only the final first reading to `0.65`.

**Actual calculation:** stable earlier/recent averages are both `0.505`, with 0% change and a 2% threshold. With the spike, recent average is `0.575`, apparent change is 13.8614%, and the calculated threshold rises to 6.8041%. Only one recent exposure supports improvement, so both diagnostic trends are `stable` and both diagnostic actions are `continue`. Product targeted review remains unavailable for VBT.

**Pending judgment:** continuing may be appropriate, but this result does not prove the spike was noise. Greg should review whether best-repetition selection, device confidence and the repeated-agreement method are suitable for this protocol. What additional context would distinguish an outlier from a real change worth investigating?

## 2. Repeated direct improvement

Standardized one-repetition squat loads are `100, 101, 105, 106 kg`; supplied session RPE values are `7, 7, 7, 7`.

**Actual result:** earlier/recent direct averages are `100.5/105.5 kg`, change is 4.9751%, threshold is 2%, and two recent exposures agree. The product evaluator returns `progress`, with `numericChangeStatus: athlete_input_required`, acceptance required and the active plan unchanged. The generated snapshot selects the direct strength series; the supplied RPE series is not selected by this strength contract. Therefore this result does **not** demonstrate integrated effort interpretation or authorize a particular load change.

**Pending judgment:** direct improvement can also justify continuing successful work. Does this athlete's goal and burden require any increase? If yes, which exact exercise/variable and permitted option should be proposed? Review the gap between detecting improved outcome and selecting an appropriate next prescription.

## 3. Lower VBT output with unchanged working performance

VBT rep pairs are `(0.54, 0.52)`, `(0.53, 0.51)`, `(0.49, 0.47)`, `(0.48, 0.46)`. Separate synthetic work records report floor press `205 lb, four sets of two, RPE 7` on every date.

**Actual result:** velocity earlier/recent averages are `0.535/0.485`, change is -9.3458%, threshold is 2.8862%, and two recent exposures contradict the improving direction. The diagnostic velocity trend is `worsening`, but its training-signal-only action is `continue`; product VBT targeted review remains unavailable. The reported work bundles are preserved in the review artifact but are **not consumed by this evaluator**. It has not reconciled the mixed evidence.

**Pending judgment:** check setup, measurement confidence, intent and working execution before a global conclusion. What specific observation would distinguish lower monitoring output from a meaningful decrease in capacity? Would that justify holding work, correcting the protocol, or proposing a targeted change? No answer is pre-labeled.

## 4. Changed protocol

Two direct load observations `100/101 kg` use the declared standard protocol version; `105/106 kg` use changed version `2.0.0` on the latter dates.

**Actual result:** the generic evaluator selects one two-exposure series rather than combining all four, returns `continue`, and excludes the other series as incompatible. In this packet it selects the newer changed-version series; generic analysis alone is not validation of catalog protocol eligibility. The targeted-outcome entrypoint filters to the exact confirmed protocol and excludes changed-version observations. Both stages are retained in the artifact.

**Pending judgment:** is two-exposure continuation with emerging evidence clear enough about what cannot be concluded? A future review must not count the four observations as one compatible trend. Decide what comparison is usable and when a new series is needed, without imposing a universal wait period.

## 5. One missing sensor repetition

Complete pairs are `(0.50,0.48)`, `(0.51,0.49)`, `(0.52,0.50)`, `(0.53,0.51)`. The counterfactual removes only the third exposure's first sensor reading; both repetitions were still performed.

**Actual result:** the complete trace has eight readings and an `improving` velocity trend (3.9604% change, two supporting recent exposures). The incomplete trace has seven readings and a `stable` trend (1.9802% change, one supporting recent exposure). Both have four exposures. Both training-signal-only diagnostic actions remain `continue`, and product VBT adaptation remains unavailable. No zero is substituted; known performed reps stay `[2,2,2,2]` in the case record. The generic evaluator does not enforce expected sensor count, so the missing best reading changes the trend classification.

**Pending judgment:** should this incomplete exposure be excluded, qualified, or represented another way for this exact protocol? This is a measurement-completeness gap, not evidence that the athlete did less work or lost capacity. The evaluator currently receives available measurements without the separate expected/performed count.

## 6. Schedule-only correction

Confirmed three-day availability changes from Monday/Tuesday/Wednesday to Thursday/Friday/Saturday, still 60 minutes. No physiological decline is asserted.

**Actual result:** ordinary `continue` compilation rejects the change with `A same-track decision cannot silently change schedule, equipment, goals, or constraints`. There is no proposed new week. This is the same real compiler boundary captured in the 24-case baseline, reused without altering that baseline.

**Pending judgment:** approve the behavior of a future reschedule operation based on confirmed feasibility, preserving intended doses and checking whole-week demands. It should not require a physiological trend merely to honor availability. SC-04 provides a relevant conceptual case, but no new schedule operation exists in this trace.

## Run and review record

```powershell
$env:PROGRAMMING_SIGNAL_REPORT = '1'
node node_modules/vitest/vitest.mjs run test/coach/programming-quality-signal-traces.test.ts --root .
Remove-Item Env:PROGRAMMING_SIGNAL_REPORT
```

Without the report variable, tests write no artifact. With it, the runner overwrites only `signal-traces.json` in this directory; preserve prior artifacts before replacing evidence needed for comparison. The original 24-case report remains unchanged.

The six cases have seven focused characterization tests. Passing them proves the recorded executable behavior and missingness boundaries, not coaching quality. The frozen trace artifact retains its original pending labels; the subsequent [human decision record](signal-review-decisions.md) records all six agreed qualitative responses and unresolved method questions. No exact numerical change is approved merely because an evaluator returns `progress` or a trend looks stable.
