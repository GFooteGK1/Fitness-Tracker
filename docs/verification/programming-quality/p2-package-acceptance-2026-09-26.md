# P2 package acceptance audit

September 26, 2026. Reviewed source: `d8a14817f0cc77281447722c378eef8ba1be41bf`.
Scope: P2 / `Fitness-Tracker-i40.3`, evidence and shared context. Read-only audit
plus this report; no tracker changes, application edits or hosted mutations.

## Verdict

September 26 follow-up: the runtime expiry and recovery gap described below is
now repaired locally under `i40.3.7`; see the
[verified repair](setup-freshness-repair-2026-09-26.md). It is not yet deployed.
The original audit and reproduction below remain historical evidence. P2 still
requires P0 adjudication and generated-response quality evidence.

Do not close P2 yet. The three evidence gaps in the September 21 completion
receipt are implemented, but **non-intent setup expiry can bypass pending-plan
acceptance**. This is concrete engineering work that can proceed while P0 human
calibration is pending. The six accepted qualitative signal judgments remain
accepted; this finding requires no new physiological threshold or numerical
policy approval.

## Acceptance mapping

| Requirement | Current code and executable evidence | Assessment |
| --- | --- | --- |
| Relevant counterfactual changes the decision | `weekly-review.ts` keeps outcome comparison, safety and direction reconciliation separate. `test/coach/weekly-review.test.ts:145` contrasts repeated versus isolated recovery signals; `:194` tests pain precedence. `test/api/coach-weekly-review.test.ts:274` uses the real evaluator/compiler to turn changed availability into a confirmed replacement schedule while preserving the accepted input. | Engineering behavior demonstrated. Does not independently qualify physiological decisions. |
| Partial history does not imply low capacity | `performed-work-context.ts` preserves exact/bounded/unknown quantities, literal load text, session effort and explicit omissions. `test/coach/performed-work-context.test.ts:20`, `:124`, `:133`, `:178` cover uncertain quantities, whole-record omission and incomplete retrieval. `test/agents/socius-prompt.test.ts:86` verifies uncertainty instructions reach chat. | Input and prompt contracts demonstrated. Actual generated-answer quality still needs the calibrated evaluation; prompt assertions are not model-output proof. |
| Chat receives actual values and exclusions | `evidence-context.ts` retains value provenance and the bounded owned exclusion ledger; `evidence-reasoning-context.ts` retains or explicitly omits complete records. `test/agents/coach-evidence-tool.test.ts:39`, `:119`, `:153` and `test/coach/evidence-reasoning-context.test.ts:16`, `:89` cover measured values, corrections, provenance, exclusions and the real owned retrieval pipeline. | Previously identified provenance/exclusion gap closed in code. |
| Deliberate older retrieval and exact outcome binding | `get_coach_performed_work` supports 1–180 days behind the existing history capability; session RPE never becomes set effort. `test/coach/performed-work-context.test.ts:150` contrasts default and widened windows. `test/coach/confirmed-outcome-scope.test.ts:56`, `:93`, `:139`, `:156`, `:168` cover distinct confirmed outcomes, exact selectors, withheld unbound baselines, separate devices and truncation. | Previously identified history/selector gaps closed in code. |
| Current context, corrections and immutable accepted history | Direction reconciliation checks current owned setup; context revisions fence source mutations. `test/database/coach-proposal-context-revision.test.ts:107`, `:117`, `:168`, `:179` cover stale writes, replay, review laundering and successors. `:197` covers clock-only **training-intent** expiry. | Mutation fencing is demonstrated; other setup expiry remains incomplete as detailed below. |
| Chat and Program share the saved decision | Both use `fetchCoachingDecisionContext`; current decisions and historical `acceptedOrigin` have separate authority. `test/coach/coaching-decision-readback.test.ts:66`, `test/coach/accepted-decision-context.test.ts:67`, `:75`, `:105`, and `test/agents/socius-prompt.test.ts:64` cover parity, stale context, historical validity and owner binding. | Shared persisted projection demonstrated; it does not recompute accepted history. |
| Ownership and RLS | Retrieval queries bind authenticated ownership; tools reject caller-supplied owners/clocks and foreign packets. `test/agents/coach-evidence-tool.test.ts:105`, `:110`, `:153`; `test/coach/evidence-context.test.ts:687`; `test/database/coach-proposal-context-revision.test.ts:220`; `test/database/capture-receipts.test.ts:120`, `:183` cover tenant reads, metadata, cross-owner references and grant boundaries. | Local defensive/query/RLS checks exist. Production closeout verified selected live catalog/ACL identity and an existing owner's readback, not every cross-owner evidence endpoint live. |

## Confirmed unfinished runtime issue

**Important: setup can expire between proposal and acceptance.**

`app/lib/coach/direction-reconciliation.ts:45` examines five memory keys at fresh
review, and lines 55–57 reject ineffective or overdue setup. However,
`supabase/migrations/20260921010000_coach_proposal_context_revision.sql:96`
only checks the current `training_intent` memory's lifecycle at acceptance.
The proposal guard at line 128 checks a data revision, then invokes that
intent-only check. A clock crossing `effective_until` or `review_after` does
not update a row and therefore does not increment the revision.

Fresh isolated reproduction used `databaseFixture()` and the actual migration
stack from `test/database/coach-proposal-context-revision.test.ts`. It inserted
an owned, confirmed `training_schedule` expiring one second later, captured the
context revision and created a rolling draft, waited 1.1 seconds, then called
`accept_adaptation_proposal` with the original key. The result was:

```json
{"probe":"expired setup after proposal creation","expired":true,"revisionUnchanged":true,"acceptance":"accepted"}
```

This used an in-memory PGlite database only. No local Supabase or production
rows were read or changed. The successful probe demonstrates the lifecycle
check gap; it does not assert that a real athlete has encountered it. The older
P2 audit already disclosed this limitation, but the completion receipt did not
resolve it. It remains relevant to the QPlan's current-context contract and
temporary-exception launch case.

## Independent work while P0 is pending

Implement and test freshness for the consumed setup bindings at proposal
creation and first acceptance, including elapsed `effective_until`, overdue
`review_after`, and future activation. Apply the same eligibility result to
shared readback so expired pending controls are withheld. Keep accepted replay
and accepted JSON immutable. Cover schedule, equipment, constraints and goal
setup separately from training intent; changes to irrelevant memory must not
silently broaden the selected contract. If SQL changes are required, use a new
additive migration; preserve the already deployed, hash-pinned migration bytes.
Local implementation is independent of P0. Hosted migration remains a separate
target-specific action.

After that regression is repaired, finalize P2 engineering acceptance against
the public calibrated cases. Actual-value explanations and resistance to
partial-history misinterpretation still require evaluation of generated
responses under the agreed model/budget, not just presence in a prompt. Do not
consume the sealed holdout for development, or treat engineering acceptance as
approval to enable `initialDosePolicy`.

## Verification boundary

Current app/test/migration paths have no delta from reviewed candidate
`afa6e1769a3acc5403fd11be79aec6734cf8f650`. The tracked
[production closeout](production-closeout-2026-09-26.md) records passing exact
candidate/main CI and the prior independent 619-test focused verification.
This audit did not rerun those unchanged passing suites. Its new narrow
PostgreSQL probe supplies evidence for the uncovered expiry scenario only.
No paid/model call, private case export, production action, commit or policy
activation occurred. `initialDosePolicy` remains hard-disabled.
