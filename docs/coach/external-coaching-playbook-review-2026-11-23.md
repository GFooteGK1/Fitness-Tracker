# Coaching Playbook assessment

The Playbook should give the athlete’s chosen model a repeatable way to decide
what to build, what to maintain, how hard to train, and how to tell whether it
worked. The local `external-coaching-0.2.0` candidate publishes that method in
the [Playbook core](../../app/lib/coach/coaching-programming-guide.ts). The
core accompanies both direct retrieval and Today preparation, including
when an older goal supplies no detail to select a domain.

## What needed clarification

| Decision | Live 0.1.0 | Local 0.2.0 candidate |
| --- | --- | --- |
| What gets build focus first? | Prioritize a meaningful goal gap when comparable evidence supports it. | Rank trainable gaps by expected contribution to the goal, room to improve, time and training cost. Name the assessment that would resolve uncertainty. |
| How should a trained athlete pursue several goals? | Describe the session stimulus and protect prior commitments. | Default to one primary build target for the block. Name maintenance work for other important qualities, the review date, and the evidence that would change the focus. |
| Where should stress sit in the week? | Protect explosive work quality and account for conditioning fatigue. | Use High/Low as the starting schedule. Count sport and outside training. Put the priority effort first. Consolidate compatible stressors, separate competing ones, and give low days a purpose and ceiling. |
| How hard should the athlete be challenged? | Progress a small number of variables and preserve movement quality and recovery. | Use actual quality, effort and recovery to choose a meaningful change. Specify the lever, ceiling, fallback and next check. A bounded trial can clarify uncertain capacity. |
| What should month-end answer? | Preserve evidence gaps and distinguish accepted work from proposals. | Compare weekly accepted targets with linked actuals and show documented dose. Evaluate measurable outcome trends separately before deciding whether to hold, progress, change focus or collect evidence. |

The live reference returned 0.1.0 on November 23, 2026. Its review scope
covered qualitative guidance. The existing weekly programming design already
has development and maintenance roles and distinguishes planning from observed
work. The new section makes those decisions explicit at the external interface.
[Prior publication contract](../plans/socius-coaching-reference-read-2026-10-19.md) ·
[Reviewed programming contract](../verification/programming-quality/supervised-programming-review-contract-2026-09-29.md)

## Evidence and application

- **Stress placement.** Concurrent-training research supports protecting
  explosive work from conflicting fatigue. High/Low and compatible stress
  consolidation are the Socius coaching defaults. The athlete’s response and
  constraints determine placement, spacing and the use of rest. [Concurrent training review](https://doi.org/10.1007/s40279-021-01587-7)
- **Build and maintain.** Smaller block studies support focused programming
  in some trained groups. Maintenance research shows that some qualities
  can hold on less work and that retention depends on the quality and athlete.
  Use a comparable stable period and a review checkpoint to calibrate the dose.
  [Block periodization review](https://pmc.ncbi.nlm.nih.gov/articles/PMC6802561/) ·
  [Strength maintenance trial](https://pubmed.ncbi.nlm.nih.gov/21873897/) ·
  [Reduced-dose trial](https://pubmed.ncbi.nlm.nih.gov/21131862/)
- **Assessment and challenge.** Use repeatable tests and known measurement
  error when interpreting a small gap. A likely limiter is a hypothesis to
  confirm. Autoregulation is one way to express a challenging, bounded dose
  and respond to daily performance. [Performance test reliability](https://pubmed.ncbi.nlm.nih.gov/11286357/) ·
  [Autoregulation review](https://pubmed.ncbi.nlm.nih.gov/35038063/)
- **Dose references.** Four fractional sets is a pooled low-volume growth
  reference for supported muscles. About ten weekly sets per muscle group is a
  general growth reference from ACSM. Record the counting convention. Select
  an athlete’s prescription using the outcome, workload history, constraints
  and available recovery. [Pelland et al.](https://doi.org/10.1007/s40279-025-02344-w) ·
  [ACSM position stand](https://doi.org/10.1249/MSS.0000000000003897)

## Example the guide should support

A trained athlete wants better acceleration while keeping squat strength and
aerobic capacity. The latest comparable sprint checks suggest early
acceleration has the clearest upside. Put short, high-quality acceleration
first on a high day. Follow with squat maintenance only if the combined work
preserves quality and recovery. Give low days an easy aerobic purpose and a
ceiling. Use a recent tolerated dose and comparable outcomes for the
maintenance targets. Schedule the block review and specify what would justify
shifting the next build focus.

At month-end, show how much required work was linked to the accepted plan and
which effort records were missing. Include separate standalone work in training
exposure. Show how the sprint and strength measures changed under comparable
conditions. When the evidence only establishes session follow-through, use that
level of detail. The local monthly review candidate supports session
follow-through and resistance exposure. Set-by-set fidelity depends on
linked prescription and actual effort records. [Chat activity contract](../decisions/ADR-0044-chatgpt-activity-record-operations.md)

## Delivery boundary

The chosen model authors and explains. Socius supplies the Playbook and saved
facts, retains accepted versions through the relevant workflow, and compares
records where evidence supports it. The new guide is qualitative and carries
scoped research references. The earlier publication retains its exact payload
and hashes. Local reference and draft delivery are distinct from installed
client behavior and model application to a real weekly plan.
