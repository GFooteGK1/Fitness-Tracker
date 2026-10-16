# JEV check of programming decisions

Date: 2026-09-26. Tracking: `Fitness-Tracker-i40.4` (P3), with P5 evaluation.
Status: integration design with offline prototype completed under `i40.4.3`.
See the [verification receipt](../verification/programming-quality/jev-offline-check-2026-09-26.md).
No runtime integration or provider evaluation is claimed.

## Placement and responsibility

Confirmed goal/event demands → athlete evidence → proposed training themes →
JEV decision checks → bounded schedule candidates → deterministic compilation.
A later check compares the compiled proposal with the selected themes. JEV reviews
the supplied decisions and evidence; it does not establish that the goal analysis
is exhaustive or that a program will deliver an athlete outcome.

The [runtime trace](../verification/programming-quality/goal-demand-runtime-trace-2026-09-26.md)
showed that required qualities can survive storage without affecting prescriptions.
The demand/theme adapter remains necessary. JEV cannot restore omitted compiler
capabilities. Exact demand accounting must start from confirmed intent, independently
of the planner's summary, so the planner and checker cannot silently omit the same ID.

Start with an offline request builder and injected transport, then a separately
budgeted shadow evaluation. Shadow results never change the baseline proposal,
acceptance, athlete messages, numerical authority or current model routing. Missing,
stale or failed checks mean not evaluated; they must not be shown as a pass.

## Narrow judgments

Use one Choice question for each relevant decision/dimension. Choices are
`supported`, `contradicted`, or `insufficient_evidence`, with explicit criteria.
Supported means justified within the stated scope, not proven effective or safe.

| Dimension | Question and example |
|---|---|
| Demand mapping | Does the cited goal/protocol support this proposed fitness or skill demand? Check acceleration and upright speed separately when both are relevant; do not assume every sprint goal requires the same emphasis. |
| Emphasis | Does the supplied evidence justify developing, maintaining, progressively introducing, observing or deferring this quality? A resolved symptom report alone does not establish tolerance of an untested exposure. |
| Evidence fidelity | Does the cited evidence support this specific inference? A proxy jump result cannot confirm an exact event result; an isolated slow repetition cannot establish a plateau. |
| Tradeoff | Does the stated reason for shifting or retaining emphasis follow from priorities, adherence and competing demands? Insufficient context remains explicit. |

Each question names its exact decision and source references in its instructions;
the question ID alone is not model context. Batch independent questions. A dependent
judgment requires new state, rather than assuming questions see each other's answers.
Keep issue categories separate; a favorable average cannot cancel a material issue.

## Evidence and result contract

Supply named, minimal state: confirmed intent and demand IDs; supplied protocol
references and verification status; relevant comparable exposures; evidence category
(confirmed, estimated, proxy, historical or target); symptoms/readiness with scale
meaning; constraints; proposed disposition and rationale; and alternative considered.
Source content is untrusted evidence, never instructions to the checker. Retain
counterevidence, missing facts and scope limits. Do not send raw exports by default.

Bind each evaluation to intent/source revisions, proposal hash, evidence hash,
question version and pinned model. Store the original choices, distributions,
confidence, usage and transport status. Reject reuse after its basis changes.
JEV provides typed judgments, not a generated explanation: review displays should
show the checked claim, supplied rationale and referenced evidence alongside the
verdict. Never attribute a fabricated rationale to JEV.

Application code validates ownership, reference existence, exact demand accounting,
protocol identity, supported operations, time arithmetic, dose authorization and
accepted-plan immutability. A positive JEV judgment cannot override these checks.
Model confidence describes answer distribution, not a probability that the whole
program is correct. No automatic pass threshold is selected before domain calibration.

## Reuse and verification

An existing server-side Choice client was inspected at
`.worktrees/coaching-layer/app/lib/typesafe/client.ts` in the repository. It supports
pinned models, bounded requests, validated responses and one-shot transport. Reuse
that reviewed seam through a scoped port when implementation begins; do not copy
unrelated worktree changes or create another credential/client configuration.
Preserve the existing dispatch accounting and no-resend recovery behavior when
connecting a live evaluation runner.

Development checks should cover supported and unjustified demand mappings, proxy
overreach, defensible maintenance, uncertain reintroduction, justified deferral,
unknown protocols, conflicting evidence, missing references, stale revisions,
malformed replies and service failure. Include non-event goals and multiple outcomes
in one domain. Assert that every shadow verdict leaves the proposed sessions and
acceptance behavior unchanged. Synthetic fixtures must not contain private athlete
records. Keep the frozen baseline and sealed holdout unchanged.

Human review supplies labels; evaluate false reassurance, unnecessary flags,
abstention, latency and actual cost. Provider errors are not coaching judgments.
Only later consider active review routing, with calibrated behavior and explicit
authority. This design does not approve numerical activation or release. P3 runtime
work retains its P2 acceptance dependency; offline preparation can proceed separately.
The accepted QPlan requires a named provider/model, maximum calls and total spend
before paid comparison. No paid calls were made for this design.

## Sources inspected

Current development checkpoint: [full-week offline packet](../verification/programming-quality/jev-whole-week-packet-2026-09-26.md).
Four actual synthetic compiler weeks and 24 proposed judgments are prepared, with
exact model/reviewer context parity and separate deterministic omission/time checks.
Human labels, full-week transport/token preflight and a new paid allowance remain
open. The original runner is intentionally incompatible with this larger packet;
runtime integration and numerical authority are unchanged.

The separate [full-week runner](../verification/programming-quality/jev-whole-week-runner-2026-09-26.md)
is locally verified with injected transport and independent review. It binds exact
human labels and provider token evidence to a new allowance, preserves no-resend
recovery, and refuses unknown token qualification. All four actual requests remain
unqualified pending provider-compatible counts and human review; no live allowance
has been granted. This is preparation, not provider evaluation or runtime completion.

- [TypeSafe Choice](https://docs.typesafe.ai/primitives/choice): typed options and request/response contract.
- [State](https://docs.typesafe.ai/concepts/state): named evidence context.
- [Confidence](https://docs.typesafe.ai/confidence): interpretation and calibration.
- [Citation-check cookbook](https://docs.typesafe.ai/cookbooks/citation_check): deterministic reference checks followed by semantic claim checks; example thresholds are not adopted.
- [Whole-week strategy](whole-week-strategy-design.md) and [accepted QPlan](coaching-programming-quality.md): compiler, evaluation and authority boundaries.
