# Evidence-conditioned programming quality — QPlan

Date: 2026-09-21. Decision status: accepted for local implementation by Greg's “Let’s take next steps.” Hosted changes, paid evaluation and numerical activation retain their separate gates.
Complexity: 4, because the change crosses evidence, coaching decisions, numerical policy, scheduling, persistence, and evaluation.
Tracking: `Fitness-Tracker-i40`. Beads owns execution status and dependencies.

## Recommendation

Build one evidence-conditioned coaching planner shared by chat, initial programming, and weekly review. Let the model interpret goals, evidence, and competing priorities, and choose among meaningful, policy-authorized prescription and schedule options. Let application code establish numerical eligibility, compile the week, validate it, and persist the athlete's accepted version.

The engine must gain a broader prescription vocabulary. Better retrieval attached to today's restricted selector will not solve the programming gap. Its first usable milestone must produce a complete, reviewable local continuity case from a provenance-checked, already accepted or independently reviewed base week. It retains an appropriate bench prescription, inserts the unchanged VBT monitoring protocol as actual sets, and relocates bench volume to improve adherence. Full APEX programming readiness requires the later multi-outcome and prescription packages.

Confidence is high in the diagnosed product gap and architectural direction; medium in the proposed policy coverage and development effort. No evidence yet establishes that a particular model, prompt, or new planner produces superior training outcomes. That requires the evaluations and longitudinal pilot below.

## Outcome and scope

For a supported athlete and goal, Socius should explain and execute: what we are training toward; what the athlete has actually demonstrated; why each dose and session belongs in this week; what is held constant for measurement; and what observations would justify a later change. The same decision must appear in chat, the proposed program, and the saved program.

Greg's launch case is five approximately 60-minute training days, APEX in April 2027, recent maximal and submaximal work, fixed monitoring protocols, and changing availability. Resolve the conflicting December app target and older availability against confirmed current intent. Do not silently substitute the event date, import all ChatGPT history, or assume previously reported symptoms have established exercise-specific clearance.

“World class” is an aspiration, not a release label. This plan makes it testable through evidence fidelity, goal fit, dose fit, whole-week feasibility, appropriate adaptation, and clarity. A valid schema or convincing rationale alone cannot pass.

Non-goals: hardcoding APEX or Greg; replacing an existing coach's accepted program; automatic load progression from calendar time; universal velocity/fatigue thresholds; replacing the LLM vendor as the primary fix; a new vector database or service; autonomous edits to accepted plans; or claiming the GPT project is an authoritative coaching standard.

## Evidence and why current programming falls short

The investigation read APEX Training conversations, authenticated Socius program/progress pages, current tracked source, and experimental coaching work. The relevant release worktree matches locally tracked `origin/main` at `f123aa8` for the inspected code. This is not proof of current production deployment, database migrations, or feature flags.

| Observed gap | Verified source or behavior | Design consequence |
|---|---|---|
| Recorded training reaches planning as familiarity, not performed dose | `app/lib/coach/planning-context.ts:105–155` strips ranges/doses and supplies empty `doseByCoverageTarget` | Preserve reported sets, reps, load, effort, provenance, and unknowns before making dose decisions |
| Fresh direction loses important outcome breadth | `planning-intent-server.ts:29–40` rejects more than three distinct domains; intake limits secondary allocations | Represent event outcomes independently of a three-domain allocation cap |
| Initial dose often falls back to policy minima or broad assessment percentages | `weekly-coverage.ts:438–453`, `session-composer.ts:196–240,402`, `programming-policy.ts:520` | Use qualified individual anchors and complete prescription bundles; do not force heavy doubles into incompatible generic ranges |
| Weekly review has a narrow action space | `rolling-weekly-plan.ts:156–167,336–427` copies prior sessions, changes limited dose fields, and appends signal guidance | Support load/repetition prescriptions, explicit monitoring sets, and schedule changes as real proposal operations |
| VBT exists as evidence but lacks a dose-policy connection | `adaptive-programming-contracts.ts:372`, `targeted-review.ts:73`, `test/coach/weekly-review.test.ts:589` | Separate protocol storage, measurement comparison, and reviewed decision policy; catalog presence does not authorize adaptation |
| Chat sees an incomplete decision picture | `agents/prompts/socius.ts:25–73` truncates context and summarizes evidence series without sample values; coach-state tool does not retrieve observations | Use one purpose-built evidence packet with retrieval coverage and actual observations |
| A next proposal can inherit stale context | `api/coach/weekly/review/route.ts:414–447` preserves the prior profile except for emphasis changes | Preserve accepted snapshots but build each new proposal from current confirmed intent and evidence |

Source paths above refer to the inspected release worktree at `.worktrees/data-to-personalized-coaching/`. Source lines will move during implementation; verify symbols against fresh main before editing.

The GPT project supplies continuity that Socius currently fails to operationalize: corrected performed repetitions, monitoring versus working sets, adherence-driven scheduling, and interpretation of mixed signals. It also made mistakes, including a corrected repetition assumption and overextended temporary programming changes. Therefore use its conversations as provenance-bearing cases for independent adjudication, not expected-output gold files.

Focused verification already completed during this investigation: 31 tests across planning-context refresh, weekly review, and rolling weekly planning passed. Those tests establish current behavior, not comparative coaching quality. This QPlan changes no application code.

## Alternatives

| Dimension | Fortress: expand deterministic rules | Avant-Garde: model authors complete weeks | Synthesizer: grounded proposal planner — recommended |
|---|---|---|---|
| Capability | Add explicit rules for each evidence/action combination | Flexible interpretation and unrestricted prescription proposals | Flexible strategy with expressive, typed, policy-authorized options |
| Numerical authority | Preserves current authority | Requires an explicit ADR change; a validator cannot prove an invented dose effective | Preserves application authority while expanding supported prescriptions |
| Complexity and maintenance | Increasing combinations of goal, evidence, and scheduling rules; policy engineering owns most changes | Simpler initial generation, difficult semantic validation; substantial ongoing model evaluation | Moderate contracts/compiler work; separate coaching-policy, inference, and application ownership |
| Migration cost | Lowest initial change, larger later rule growth | Highest boundary change and revalidation burden | Incremental reuse of existing evidence, compiler, acceptance, and rollout seams |
| Failure modes | Safe-looking generic or rigid weeks | Unsupported precision, factual invention, inconsistent repeat runs | A narrow option menu can still prevent good coaching; missing candidates must be visible |
| Security and operations | Predictable execution, audit rule versions | Untrusted text influences broader decisions; high observability burden | User-scoped retrieval, untrusted source isolation, traceable selections and policy versions |
| Verification | Rule tests plus complete-week coaching review | Extensive factual, dose, and coaching review on every supported scenario | Contract tests plus blind evaluation of executable weeks and longitudinal decisions |
| Reversibility | Version policies and disable rules | Restore previous generator; explain potentially broad behavior changes | Independently disable proposal operations, retain evidence and accepted plans |

Choose Fortress if the intended product narrows to a small, stable set of standardized programs. Reconsider Avant-Garde only after an explicit numerical-authority decision and evidence that its additional freedom reliably improves coaching beyond what typed operations can express. A stronger model may help the recommended approach; it is an evaluation variable, not a prerequisite.

## Architecture and contracts

Flow: **confirmed athlete state and decision history → outcome demands and constraints → grounded strategic intent → eligible prescription bundles and schedule alternatives → model selection of typed options → deterministic compilation and whole-week validation → proposal diff → athlete acceptance → performed work and observations.**

Strategy must inform candidate construction before allocation. The model can propose goals, priorities, and nonnumeric intent; the policy layer resolves admissible numerical bundles. The model selects identifiers or requests a supported operation, never supplies an unvalidated load under the guise of composition. If the candidate set cannot express a justified decision, return a named capability gap and a useful supported alternative or decision-changing question.

| Contract | Required contents and invariants | Primary implementation boundary |
|---|---|---|
| Athlete planning snapshot | Current confirmed outcomes/date, availability, preferences, restrictions, equipment, outside training, prior accepted week, corrections, freshness and conflicts | `planning-context.ts`, `planning-intent-server.ts`, intake and weekly-review routes |
| Performed-work evidence | Exact/bounded/unknown quantities; exercise/variation; separate sets; actual versus prescribed; RPE; source path and revision; no aggregate-to-max conversion | Reuse reviewed portions of experimental `performed-dose-evidence.ts` and its review projection |
| Monitoring protocol | Versioned exercise/variation, fixed load/reps, rest and session placement, measurement device/metric/method, unit, intended purpose, baseline and comparable observations | Existing evidence contracts/catalog plus explicit protocol persistence and execution links |
| Goal-demand model | Multiple measurable outcomes, direct/proxy evidence, priorities and maintenance decisions, event timing, shared movement and fatigue demands, supported-capability map | Extend existing adaptive goal/allocation contracts; remove arbitrary domain restriction only with downstream support |
| Prescription operations | Repeat accepted bundle; continue qualified performed bundle; choose reviewed calibrated dose; reschedule; insert fixed protocol; maintain/deprioritize an outcome; collect a missing signal | Versioned policy/candidate builder, `session-composer.ts`, `weekly-coverage.ts`, `rolling-weekly-plan.ts` |
| Coaching decision record | Input revisions, retrieved evidence and omissions, selected/rejected options, evidence interpretation, policy/strategy versions, retained and changed work, expected observations, limitations | One persisted proposal record consumed by chat and program UI |

Monitoring sets and working sets must have distinct roles. Missing velocity reps remain missing even when performed repetitions are known. A protocol change starts a new comparable series; cross-protocol comparisons require an explicit approved mapping. Velocity can inform a reviewed interpretation but cannot become a universal automatic progression rule.

Scheduling corrections use confirmed availability and adherence information; they do not require physiological adaptation evidence. Dose, emphasis, and recovery changes require the relevant evidence and policy. The planner must reconcile competing outcomes across the whole week rather than applying the highest-priority isolated adjustment.

Time feasibility includes warm-up, ramp sets, monitoring, work, rest, transitions, and user-specific constraints. Evaluate overlapping demands and consolidation of stressors qualitatively against priority session quality. Do not install a universal fatigue score or mandatory spacing rule without separate support.

Corrections supersede the referenced evidence for future reasoning and invalidate affected unaccepted drafts. Accepted weeks remain immutable. Recompute the next proposal using fresh context, showing differences from the accepted snapshot. Never rewrite history to make the current recommendation appear consistent.

Supabase remains canonical. Reuse existing tables/contracts where semantics fit; add migrations only for missing durable protocol, decision, or revision relationships. Every new user-owned row and relation requires RLS and ownership tests. No duplicate ChatGPT memory store. Imported conversation content is untrusted athlete evidence, not executable instructions. Store only necessary excerpts/provenance with user-visible correction controls; keep private case exports out of committed test fixtures.

Create an ADR using the next free identifier from fresh main. It should preserve ADR-0003 numerical authority, ADR-0007 immutable acceptance, and ADR-0021 capability boundaries while defining expanded proposal operations and shared context ownership.

## Reuse and dependency boundaries

- Reuse `Fitness-Tracker-u5l` capture/intent/history infrastructure. Its existence does not establish deployment or activation.
- Keep `u5l.14` through `u5l.17` as the A0–A3 deployment path: current-state evidence, isolated migration/canary, production schema with flags off, then staged existing capabilities. Do not create a competing rollout chain.
- Reuse `Fitness-Tracker-qsp` for qualified review of the existing initial-dose continuity policy; `u5l.6` for that policy's compiler reconciliation; and `u5l.11` for its held-out numerical verification. Extend their acceptance criteria only where the accepted scope truly overlaps.
- Add separate review coverage for VBT interpretation, event-specific strength endurance, running/sprint decisions, and whole-week reconciliation. The existing strength/hypertrophy continuity review does not authorize these automatically. Proposed “two identical exposures” and “28 days” remain engineering hypotheses until reviewed.
- `Fitness-Tracker-f4k` is completed evaluation preparation, not evidence of coaching superiority or approval for further paid calls.
- Experimental `.worktrees/coaching-layer` evidence normalization, monitoring guidance, decision packet, strategy, and eval artifacts are candidates for selective reuse. Its selector still cannot change numerical doses or schedules. Review and port bounded components; do not merge that dirty worktree wholesale.
- Preserve all root and worktree changes. Start implementation in an isolated checkout from freshly verified main, reconcile contract versions, and inspect the applicable AGENTS files.

## Ordered delivery packages

Each package has a runnable athlete case. Infrastructure outputs alone cannot close a package that promises coaching behavior. Engineering owns contracts, compilation, persistence, and tests; a qualified coaching reviewer owns the numerical/physiological interpretation review; Greg confirms personal context and acceptance. Assign the reviewer before policy freeze. No outreach is authorized by this plan.

| Package | Work and dependencies | Acceptance evidence | Rollback boundary |
|---|---|---|---|
| P0 — Freeze baseline and adjudicated cases | Record current behavior, extract sanitized cases, identify disputed facts and candidate policy scope. No dependency on production activation | Reproducible current-Socius output; independently adjudicated expected decisions/ranges and prohibited inferences; reviewer assignment recorded | Test/doc changes only |
| P1 — Deliver bench continuity vertically | P0 plus applicable `qsp` review and `u5l.6` reconciliation. Add minimum snapshot, dose, protocol, reschedule, decision and acceptance contracts needed for one complete week | Executable bench work, unchanged monitoring sets, adherence-driven relocation, real time accounting, explanation/persisted readback agree; source correction invalidates a draft; athlete can accept version | New proposal capability off; previous accepted plan preserved |
| P2 — Complete evidence and shared context | P0. Develop alongside P1 and converge on the same contracts; no dependency on numerical activation. Integrate purpose-based retrieval, provenance, corrections, coverage manifest, latest intent, and shared chat/plan decision projection | Counterfactual evidence changes the relevant decision; partial logs do not imply low capacity; chat can explain actual values and exclusions; cross-user access denied | Disable new retrieval consumers without deleting evidence |
| P3 — Support multi-outcome weekly strategy | P2. Replace cap-constrained goal projection, build strategy-informed schedule alternatives, support outside training and outcome maintenance | All confirmed APEX outcomes are accounted for; five sessions fit; bench movement affects actual schedule; competing demands have an explicit resolution; infeasible weeks are surfaced | Fall back to accepted week/supportable scope with visible limitation |
| P4 — Expand reviewed prescription/adaptation policies | P2 and separate qualified policy review; integrate with P3 for whole-week decisions. Add supported load/repetition/event-specific and measurement-based operations | Reviewed case trajectories produce appropriate hold/change/collect decisions; no single noisy sample or calendar tick forces progression; protocols remain comparable; unsupported cases remain explicit | Disable individual policy versions/operations |
| P5 — Prove comparative quality | P1–P4, P0 sealed holdout, and reuse `u5l.11` numerical checks. Test complete persisted proposals, not just strategies | Predeclared quality gates below; blind baseline comparison; critical errors zero; no private-data leakage; latency/cost measured under agreed budget | Stay in local/shadow mode; repair failing package and use untouched holdout |
| P6 — Controlled activation and longitudinal review | P5 plus completed applicable A0–A3 prerequisites and explicit target-specific release authority | Isolated hosted canary, complete accept/log/review cycle, rollback demonstration, named athlete pilot and weekly adjudication | Stop new proposals; return existing paths; retain accepted versions and factual records |

Beads mapping: P0 `i40.1`; P1 `i40.2`; P2 `i40.3`; P3 `i40.4`; extended policy review `i40.5`; P4 `i40.6`; P5 `i40.7`; P6 `i40.8`. All IDs have the `Fitness-Tracker-` prefix. Extended policy review follows P0 and can proceed independently of P1–P3. P4 completion includes integration with P3.

P1's base week must be suitable for its declared test scope; the observed three-session Socius week is not automatically a suitable five-day APEX base. If a suitable accepted or independently reviewed base is unavailable, producing and reviewing it is an explicit P0 dependency. P1 preserves compatible remaining work and demonstrates the isolated local acceptance flow only. It does not enable numerical personalization for Greg. Held-out numerical verification remains in `u5l.11`/P5, and live activation remains P6. Unchanged monitoring protocol insertion does not introduce VBT-driven adaptation before its separate review.

P0 can start immediately after plan acceptance. Context, protocol capture, scheduling support, and offline evaluation can advance while numerical review is pending. A reviewed prior accepted prescription can be retained under its existing authority; copying a newly interpreted performed dose requires the applicable policy review. Never label an unreviewed numerical path “continuity” to bypass its gate.

## Evaluation and release evidence

Build 40 adjudicated scenarios initially: 24 development and 16 sealed holdout. Include different athletes and multiweek trajectories; split related trajectories and near-duplicates together to avoid leakage. Use sanitized fixtures for committed tests. Keep the real Greg case private and permission-scoped. The counts are evaluation-design choices, not physiological evidence thresholds.

Six dimensions, each scored 0 (unacceptable), 1 (requires material correction), or 2 (usable within declared scope): evidence fidelity; outcome/athlete fit; prescription suitability; whole-week feasibility; monitoring/adaptation judgment; executable clarity and consistency. The qualified reviewer calibrates sample ratings before judging the holdout. Deterministic graders check facts, provenance, protocol identity, constraints, persistence and authority; human domain review judges coaching quality. An optional model judge may help triage, but cannot independently approve numerical policy or release.

Required launch cases include:

1. Corrected working repetitions supersede an earlier interpretation; aggregate repetitions never become a maximum-effort set.
2. Successful bench doubles with mixed velocity/effort evidence produce an explainable hold/change decision grounded in a reviewed policy.
3. Fixed bench and trap-bar monitoring appear as actual sets distinct from working sets; missing sensor reps do not alter known performed volume.
4. A change from three monitoring reps to two, or a variation/device change, prevents unqualified trend pooling.
5. Missed bench volume prompts a justified schedule change without pretending the athlete became weaker.
6. All confirmed event outcomes have a role or explicit maintenance/deprioritization decision; no silent goal deletion.
7. Five 60-minute sessions remain feasible after warm-up, rest, monitoring and outside training are counted.
8. Prior tightness, later symptom-free different activity, and current self-report are interpreted with exercise-specific uncertainty.
9. Sparse or conflicting history yields a useful limited prescription or a focused clarification; it does not trigger invented precision.
10. An evidence correction invalidates an unaccepted draft; an accepted plan stays immutable; saved readback and chat match the reviewed proposal.
11. One low velocity/recovery reading cannot silently cause a durable program change; repeated comparable direct evidence can drive the reviewed alternative.
12. A temporary exception expires or is explicitly reconfirmed; stale event dates/preferences cannot override confirmed current intent.

Compare current Socius, the proposed planner, and an independently adjudicated coaching reference using the same information budget. GPT outputs are source material, not the reference automatically. Blind-review final executable weeks, then reveal rationales to assess traceability. Grade abstention separately from useful programming; do not count “collect more evidence” as a successful week. Report supported coverage over all 40 cases so avoiding hard cases cannot inflate quality.

Gate a declared launch scope only when all mandatory launch cases pass, every supported holdout case receives 2 on all six dimensions after blinded adjudication, and there are zero critical factual, protocol, ownership, numerical-authority, or persisted-output contradictions. Require demonstrated resolution of the baseline's named failures without a new material failure. Report raw case counts and uncertainty; this small benchmark cannot prove broad statistical superiority. Freeze supported scope before the sealed run; do not relabel failures unsupported afterward. Holdout failures return to development and require a fresh untouched holdout for the next release claim.

Use relevant unit/property tests for source interpretation, candidate eligibility, compiler invariants, constraint conflicts, protocol versioning and draft invalidation; integration tests for chat/planner parity, RLS, acceptance and readback; hosted end-to-end tests for propose → accept → log actual work → review next week. Reuse existing suites instead of mirroring implementation with trivial tests.

Measure proposal latency, token use, tool failures, unsupported operations, retrieval omissions, correction rate, and athlete rejection/edit reasons. Before any paid comparison, specify provider/model, maximum calls and total spend for explicit authorization. Earlier experiment budgets do not carry forward.

After offline qualification, run a named, opt-in pilot for at least four weekly review cycles as an operational minimum. Judge adherence, usability, corrections, and consistency of prescribed-versus-performed evidence. Review training response on the horizon appropriate to each goal; four weeks cannot establish long-term superiority or APEX readiness. Expansion requires reviewer and athlete assessment of unresolved errors, not elapsed time alone.

## Activation, unresolved decisions, and authority

Existing production schema, migration ledger, active flags, deployment identity, backups and isolated canary remain to be reverified through A0. Preview that shares production Supabase is not isolation. Do not infer these facts from the September 18 record. Keep `initialDosePolicy` disabled until its own review, reconciliation and evaluation gates pass; broader VBT/event policies need their own explicit scope and capability gates.

Remaining decisions, in dependency order:

1. Greg accepts or changes this architecture and first vertical slice. Plan acceptance authorizes the named local implementation work, not hosted writes or numerical-policy activation.
2. Assign a qualified coaching reviewer and confirm review scope. Freeze each numerical policy only after review; other local work continues meanwhile.
3. Confirm unresolved personal evidence, event date and monitoring protocol details through source-backed confirm-or-correct UI before using them for a real proposal. Do not ask Greg to restate documented facts that retrieval can establish.
4. Approve any paid evaluation budget with named targets, then later the exact isolated/production release actions and pilot scope when reviewable evidence is ready.

Acceptance of this plan does not authorize commits, pushes, deployment, external outreach, production migrations, bulk ChatGPT import, or mutation of Greg's live athlete records. Those actions follow their existing target-specific authority. No extra platform dependency is currently required.

Independent architecture review supported the hybrid recommendation and required the broader executable operation set, whole-week quality gates, and the bench/VBT/scheduling vertical slice. Final review also required an explicit reviewed base week and local-only P1 acceptance boundary. Those conditions are incorporated here.
