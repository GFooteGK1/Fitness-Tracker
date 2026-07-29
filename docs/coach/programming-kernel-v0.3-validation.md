# Complete Programming Kernel v0.3 Validation

Status: local additive gate, not connected to the live Program workflow.

## Golden matrix

The executable goldens are defined in
`test/coach/golden-programming-profiles.ts`. They preserve exact first-week
movement selections plus whole-plan invariants without committing large,
brittle eight-week JSON snapshots.

| Golden | State | Domain | Schedule | Equipment |
| --- | --- | --- | --- | --- |
| New bodyweight strength | New or returning | Strength | 2 x 30 min | Bodyweight |
| Consistent gym hypertrophy | Consistent | Hypertrophy | 3 x 60 min | Full catalog |
| Experienced field power | Experienced | Power/explosiveness | 4 x 75 min | Field, medicine ball, barbell |
| Consistent track speed | Consistent | Speed/agility | 4 x 60 min | Bodyweight and track |
| Experienced cyclical aerobic | Experienced | Aerobic | 5 x 45 min | Bike and rower |
| New bodyweight resilience | New or returning | Resilience | 3 x 45 min | Bodyweight |

Each profile deterministically builds eight weeks and must pass the same
whole-plan validator used by every other v0.3 draft. Weeks 4 and 8 remain
pending athlete review; the builder does not claim that a deload has already
occurred.

## Failure gate

`app/lib/coach/program-validator.ts` rejects a draft when any of these
contracts fail:

- Every weekly requirement is represented once in the ledger, and assigned
  dose is preserved in exactly one work prescription or has an explicit gap.
- Session time, day assignments, block minutes, and coverage references agree.
- Specific preparation comes first and priority adaptation follows it; speed
  or power cannot be placed after avoidable high-fatigue work.
- Movements satisfy the accepted equipment, experience, and explicit
  constraints and actually own the requested domain and coverage.
- Substitutions are eligible and preserve the same domain and coverage.
- Sets, repetitions, intervals, work, recovery, execution target, rest,
  success, and stop details are actionable rather than generic prose.
- Saved-assessment loads match an unambiguous movement, policy percentage
  bounds, the saved estimated 1RM, units, and deterministic rounding.
- Weeks 4 and 8 name the policy-controlled stressors and remain pending athlete
  review until an inspectable adaptation is accepted.
- Version and format markers match the complete v0.3 contract.

The adversarial suite mutates otherwise valid plans to prove these failures.
It also proves the current v0.2 one-primary-plus-one-support proposal cannot be
misclassified as a complete v0.3 plan. Completeness is based on traceable
adaptation coverage, not a universal exercise count.

## Remaining release gate

The current Program workflow still creates and stores policy v0.2
prescriptions. v0.3 must not go live until the Program renderer, proposal/RPC
persistence mapping, immutable acceptance behavior, legacy read path, mobile
layout, and production release checks are completed.
