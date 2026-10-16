# Goal analysis informs training themes

Status: general qualitative principle confirmed by Greg on 2026-09-26.
Tracking: `Fitness-Tracker-i40.4` (whole-week strategy), with context requirements
under `Fitness-Tracker-i40.3`. Implementation and verification remain unfinished.

## Confirmed intent

Greg confirmed that the reviewed event is a current example. The general principle
is to break down the athlete's goal or event into its demands and use that analysis
to establish the major training themes that will produce the desired outcome.
The example's event list, training split, dose and priorities are not universal
defaults. Its accepted structure remains scoped to that example.

### Default exposure versus emphasis — clarified September 26

Greg answered “Correct” to including some goal-relevant exposure by default, then
using athlete evidence to decide whether to develop, maintain or temporarily defer
it. Goal relevance identifies a demand; it does not by itself justify more work,
maximal intensity or a particular exercise. Progressive introduction remains an
option when the athlete needs to establish tolerance. Unknown capacity is not
proof of incapacity, and a temporarily deferred quality remains in the demand map
with its reason and reassessment condition. This principle authorizes no numerical
dose, fixed frequency or automatic maximal exposure.

JEV must judge demand relevance separately from the current emphasis decision.
The [clarified review cases](jev-decision-clarifications-2026-09-26.md) preserve this
separation without changing the original live trial's requests or labels.

## Planning sequence

1. **Define success.** Establish the desired result, its importance to the athlete,
   how it will be assessed, the time horizon and any relevant event standards.
   General health, capability, strength and other non-event goals also need clear
   outcomes; do not invent a competition or require a numerical target unnecessarily.
2. **Identify demands.** Decompose success into relevant fitness qualities,
   movement or technical skills, and capacities needed to tolerate the work.
   Preserve distinct demands within broad labels such as strength or speed.
   Use current, sourced rules when the goal depends on an event protocol.
3. **Compare with the athlete.** Use actual performance, comparable exposures,
   training history, adherence, readiness and limitations to distinguish strengths,
   likely limiters and unknowns. Missing data is not evidence of poor performance.
   Ask for information that materially changes the choice; collect assessment
   evidence when necessary rather than assuming the limiter.
4. **Set major themes.** Decide what to develop, maintain, introduce progressively
   or temporarily defer, and explain why each choice serves the goal. Balance
   likely benefit, confidence in the evidence, time, recovery cost and athlete
   preference. Event scoring informs opportunity; it does not dictate equal
   training time or prove a particular intervention will improve the score.
5. **Build the program.** Translate the themes into emphasis over the preparation
   period, weekly allocation, session intent, exercise selection and complete
   prescriptions. Fit the athlete's available time, equipment and recovery.
   Shared work may serve several demands without duplicating its time or fatigue
   cost. The program should expose any meaningful demand left uncovered and why.
6. **Check the result and adapt.** Compare prescribed work with actual work,
   response and relevant outcome measures. Distinguish improvement in a supporting
   exercise from transfer to the goal. Adjust emphasis when evidence supports it;
   the calendar informs preparation and event proximity but does not establish
   adaptation, plateau or readiness by itself.

Each major training theme should answer: what outcome does this serve, why is it
needed now, what evidence supports the allocation, and what would change it?

## Review criteria for implementation

These describe behavior to demonstrate, not completed tests or a frozen design:

- One event may require several training domains; the full demand map survives
  intake, normalization, allocation, compilation and rendered/persisted output.
- A non-event goal follows the same reasoning with suitable success measures.
- Different athlete evidence can produce different emphasis for the same goal.
- Distinct goals can produce different emphasis from the same performance data.
- Uncertain or absent evidence remains visible and is not silently converted into
  an athlete deficit, a maximal assessment or an invented prescription.
- Time and recovery constraints yield explicit priorities and supported tradeoffs,
  while important deferred demands retain a reason and reassessment condition.
- Outcome evidence can change emphasis; a single difficult session or a date
  change alone does not establish a strategic transition.
- A reviewed example does not hard-code its exercises, exposure counts, loads,
  scoring assumptions or readiness requirements into every athlete's plan.

Current source already contains goal/outcome and performance-quality coverage
constructs. Trace their actual use before deciding whether to extend the model
or repair the connection between existing components. This document confirms
planning intent; it does not claim runtime ingestion, event decomposition or
production behavior is implemented, and does not activate numerical policy.
