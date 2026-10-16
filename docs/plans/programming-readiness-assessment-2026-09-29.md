# Programming readiness assessment — September 29, 2026

Status: Greg accepted the supervised first milestone on September 29: “Okay, set a new goal on completing milestone one and then let's get started.” Canonical feature: `Fitness-Tracker-i40.17`, reusing `Fitness-Tracker-u5l.11.1`. This authorizes local implementation of the bounded milestone, not hosted activation. The proposal language below preserves the assessment that was presented. Beads remains authoritative; this document is not a second task tracker.

Accepted amendment: qualify supervised management of one already-reviewed athlete program as a separate first-use milestone, with its own scoped access, quality evidence and release criteria. Full P0-P6/APEX remains unfinished; its dependencies and broad acceptance are unchanged. No first-week athlete/base, runtime numerical authority or target-specific deployment permission is inferred. Begin with effort/RIR lifecycle verification and consolidate existing decisions; identify the named athlete/base before dependent pilot work.

Native goal creation was initially refused because the earlier goal was paused and unfinished. Greg subsequently cleared it; a fresh read confirmed no existing goal, and the milestone-one goal was created successfully with active status. The old goal was not falsely marked complete. Beads and the board retain the broader unfinished work.

## Recommendation and finish line

Execution checkpoint September29: `u5l.11.1` is now closed after real local
Next/browser proof,20 fresh authenticated readback checks and independent
acceptance review. See [effort/RIR evidence](../verification/programming-quality/effort-rir-storage-2026-09-29.md).
The accepted rules are consolidated in the [supervised review contract](../verification/programming-quality/supervised-programming-review-contract-2026-09-29.md).
[ADR0035](../decisions/ADR-0035-supervised-programming-scope.md) proposes the next
scoped workflow boundary; athlete/base selection and its implementation remain.
Historical gap descriptions below reflect the original assessment.

Make the first usable milestone **Socius manages one athlete's already-reviewed program under coach supervision**. Define success as a complete cycle: confirmed context and accepted base → complete next-week proposal → coach review of new prescriptions → athlete acceptance → actual set logging → response review → another justified proposal. Show why each change serves the goal. Unsupported changes must return for review without pretending that no useful work was possible.

This is the shortest credible route to use, but it is a proposed scope amendment. The accepted QPlan currently puts hosted activation after P5. Supervision does not waive quality, ownership, persistence, recovery or release checks. Do not enable the current global numerical capability merely to expose this smaller milestone; a separately scoped capability/eligibility boundary must be designed and reviewed if this route is accepted.

Generating a suitable first week from new athlete context and managing all APEX demands remain the broader destination. They are not established by replaying approved examples.

## Why the board looks scattered

Live board version 100 and canonical Beads were read on September 29. No pending board feedback was returned.

- The project headline and next step still describe September 27 release-test preparation. Beads now marks both preparation children `i40.15.1` and `.15.2` closed. The release parent is correctly unfinished.
- The P1 card still calls W5 open and asks for a reviewed bench week. W5 and all 14 children are closed, and the bench reference is accepted. P1 still has P0/package acceptance requirements; it does not need that infrastructure rebuilt.
- Recent work appears mainly as notes under P0, including W10 and the effort/RIR implementation. Parent cards do not show which engineering pieces are complete versus which coaching judgments remain.
- Broad product milestones, detailed engineering, research/JEV work and release preparation share the same apparent priority. They do not form a visible sequence to a usable programming outcome.
- Coaching feedback has revealed legitimate implementation gaps, but each new example has extended development without a stable, visible release boundary. A growing set of reviewed examples is not yet a general decision policy.

Assessment: both presentation drift and a real capability gap exist. A board cleanup alone will not make the planner ready. Conversely, open parent packages do not mean the completed engineering must be repeated.

## What is actually ready

| Area | Evidence and practical limit |
| --- | --- |
| Earlier production integration | PR84 is merged; `i40.11`, `.12` and `.14` are closed. Do not repeat cutover or profile rehearsal. |
| Reviewed program lifecycle | W5 is closed for its bounded reviewed options. Recorded real local Auth/PostgREST/Next/browser evidence covers proposal, acceptance, actual work, corrections, recovery and next-week continuity. This is local proof, not hosted activation. |
| Evidence/context foundation | P2 engineering children are closed. P2 parent remains in progress for P0 and actual generated-response acceptance. |
| Effort-led work and time priorities | Shared representation preserves uncapped RIR-governed repetitions, optional trailing work and honest time estimates. Actual-RIR form/report code and migration `20260929010000` also exist locally. Retained-database/browser proof of that newer extension remains unestablished in the current handoff; `u5l.11.1` stays open. |
| Setup-freshness release preparation | PR86 is draft at `cfd5aa6f`; CI36339681920 is successful. Fresh attended database preflight and coordinated rollout remain. Only old process metadata exists locally; no new attempt/result file was found. This is a separate reliability release, not programming activation. |

Current source explicitly sets `initialDosePolicy: false`; the production reviewed registry is empty. The programming checkout has substantial uncommitted work at `d8a1481`; existing verification receipts must be tied to reviewed release commits before shipping. A dirty checkout is not itself a defect, but it is not one deployable, verified release artifact.

## What still needs to be delivered

| Outcome | Existing canonical work | Completion evidence |
| --- | --- | --- |
| Finish the effort and actual-work contract | `u5l.11.1` | A real authenticated save/accept/log/correct/complete/readback cycle preserves target and actual RIR independently, optional omissions, old snapshots and uncertain requests. No skipped set counted as performed. |
| Turn existing coaching judgments into a usable specification | P0 `i40.1`, W10 `u5l.11` | Consolidated accepted decisions, explicit unresolved cases and calibrated review of actual output. Current P0 ledger: 24 cases, one partial review, zero complete reviews, no calibration. W10's recorded 12-case run has two reviewed-reference compilations, ten review-required outcomes and no unseen quality pass. Do not ask Greg to reapprove settled principles or manufacture missing scores. |
| Make goals change the executable program | P1/P2/P3 `i40.2`–`.4`; selection defect `i40.6.3` | Close existing P1/P2 acceptance using retained evidence. Then connect confirmed outcomes to training priorities, movement selection and schedule. Preserve every demand or explain its deferral. Test full-gym versus limited equipment, strength versus hypertrophy, acceleration versus top speed, and reduced availability. Warm-up, rest, effort, monitoring and time must be actual saved instructions. |
| Make progression work beyond exact examples | Extended review/P4 `i40.5`/`.6` | Versioned, reviewed hold/increase/reduce/clarify operations respond to comparable performed work, recovery and goal priorities. Changes affect the saved week and preserve unchanged monitoring. A first-week path must be explicit; do not invent an accepted base to enter the replacement flow. |
| Qualify and release a declared scope | W10, P5/P6 `u5l.11`, `i40.7`/`.8`; applicable release gates | Fresh supported scenarios, complete persisted outputs, calibrated human judgments, no critical violations, bounded cost/latency, exact-commit CI, hosted isolation/canary and rollback, then a named athlete pilot. Reconcile older activation tasks with completed cutover receipts before taking any action. |

The current general composer exists. Its known limitations remain material: movement scoring still starts from the lower-fatigue preference; goal projection retains the three-domain boundary; the demand trace documents secondary maximum-velocity omission. Passive reviewed movement identities have been added, so the older statement that the entire catalog lacks vertical pulls is stale. Adding identities alone does not repair active selection.

The new reviewed path is deliberately narrower: it matches exact review/source/profile/context hashes and a reviewed schedule. The authenticated path additionally requires a matching athlete registration and accepted base. That protects accepted work, but it does not create a suitable new week from unfamiliar context.

## Options and dependency order

| Option | Benefit | Cost and recommendation |
| --- | --- | --- |
| Finish the full accepted QPlan before any new programming pilot | Keeps one existing qualification boundary; supports the broader goal | Longest route to first use. Prefer if independent APEX planning is required on day one. |
| Turn on the current reviewed path | Appears quickest | Reject as a launch plan: registry is empty, current contexts require exact review, newer lifecycle proof and hosted qualification remain. A flag change does not supply readiness. |
| Add a bounded supervised-management milestone, then expand | Uses completed lifecycle work and produces athlete feedback sooner | Recommended with medium confidence. Requires explicit scope amendment, useful supported review/registration workflow, scoped access and its own quality/release criteria. Full P0–P6 remain visible and unfinished. |

Proposed sequence after scope acceptance:

1. Finish `u5l.11.1` and consolidate existing decisions into one review packet. Do not start another exploratory example unless it answers a named launch requirement or exposes a concrete defect.
2. For the supervised milestone, define one named athlete/base and supported transitions; provide a maintainable review/registration process rather than silently embedding each new week in developer fixtures. Verify two successive proposal/log/review cycles. If proceeding with the original broad launch instead, finish P0 and P1/P2 before P3/P4 per existing dependencies.
3. Qualify the declared scope against fresh cases and adversarial context changes. Keep the broader P5 sealed set untouched until its prerequisites are met. Supervised scope needs separate explicit acceptance; it cannot borrow a broad quality label.
4. Package only the reviewed dependencies into release commits, run exact-artifact checks, prepare scoped pilot access and demonstrate disable/recovery. Obtain the remaining target-specific release authority only when the concrete packet is ready.
5. Expand goal-demand planning and reviewed adaptation under P3/P4, then complete the broad P5/P6 gates. Full APEX readiness requires all its declared demands, not just the strength continuity example.

The setup-freshness release can proceed on its existing separate track when secure-entry readiness and rollout authority are available. Its refreshed evidence is a dependency of any release using those contracts, not proof of improved coaching decisions.

Keep meal-photo automation, broader cross-domain features, dormant offline paths and optional JEV expansion outside this programming critical path unless a specific launch defect depends on them. JEV remains an advisory quality check; further calibration does not substitute for the planner, human review or fresh paid-call authority.

## Board presentation and ownership

Retain milestone/task IDs and Beads authority. Present one programming delivery sequence: **usable reviewed cycle → goal-based planning/adaptation → measured quality → authorized pilot**. Each card should state separately: engineering complete, coaching acceptance pending, and production status. Link completed children instead of repeating their work. Keep the setup repair under releases and mark research as advisory.

Codex owns implementation, evidence packaging and factual board reconciliation. Greg supplies unresolved coaching judgments and launch-scope decisions; designated qualified review supplies the relevant coaching-quality acceptance. Human review should be batched around complete weeks and materially different cases, with prior decisions already filled in as sourced decisions, not inferred scores.

This assessment authorizes no deployment, migration, credential access, model spend or numerical activation. It proposes no task closure. Detailed board restructuring and any earlier supervised pilot scope remain proposals for acceptance.

## Sources checked

- Live scoped board context/feedback; canonical Beads epic and child status/notes.
- Live GitHub PR84, PR86 and CI36339681920; local preflight artifact names only.
- `docs/plans/coaching-programming-quality.md`, especially ordered packages and release criteria.
- `docs/verification/programming-quality/w5-acceptance-audit-2026-09-28.md` and W10 development/review records.
- `app/lib/coach/offline-reviewed-week.ts:160`, `reviewed-week-context-server.ts:43`, `reviewed-proposal-service.ts:8`, `reviewed-http-service.ts:8`.
- `app/lib/coach/session-composer.ts:321`, `planning-intent-server.ts:38`, `weekly-coverage.ts:538`, `movement-catalog.ts:579`.
- `app/lib/personalized-coaching-capabilities.ts:8`; current effort/RIR implementation and prepared migration.

Independent read-only assessment confirmed the exact-registration and accepted-base limits, and the need for an explicit plan amendment before a narrower hosted pilot. No sealed case contents were inspected. Existing test receipts were reviewed; no application tests were rerun for this documentation-only assessment. No current production database/flag state was inferred from local source.
