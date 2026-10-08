# Complete reviewed developmental week: local compiler evidence

Task: `Fitness-Tracker-u5l.6.4`. Branch: `codex/programming-quality`.
Parent W5 and P0/P1 remain incomplete. Local implementation; no deployment.

## Implemented

`app/lib/coach/offline-reviewed-week.ts` accepts only a trusted, exact reviewed
recipe and schedule ID. It binds the current full profile, factual context,
review and source revisions. The complete result has a separate format and
explicit `numericRuntimeEligible: false`, `persistable: false` and required
athlete acceptance. It is not a saved rolling-week plan.

The typed developmental fixture preserves all five sessions: preparation,
individual ramp sets, working doses, per-set RPE targets, rests, per-side core,
distance stages, monitoring and recovery. Assistance load stays athlete-selected;
monitoring effort retains the RPE ceiling. Cooldowns retain qualitative easy
effort without inventing numerical targets. Actual RPE and velocity are not
backfilled. Complete source instructions accompany the structured lowering.

Timing is calculated from work, between-set and after-set rest, reviewed fixed
preparation windows, transitions and logging. Rep ranges retain both bounds;
time estimates use the upper bound. Prescribed pace and time allowances remain
different fields. The implementation uses ten seconds per preparation drill trip
inside its fixed window as a disclosed accounting allowance, not a pace target.
These are estimates, not measured durations or permission to truncate recovery.

| Session | Calculated estimate | Available |
|---|---:|---:|
| Monday acceleration/squat | 54:21 | 60:00 |
| Bench volume | 42:09 | 60:00 |
| Running | 42:42 | 60:00 |
| Friday upright/trap bar | 48:09 | 60:00 |
| Saturday bench force | 67:09 | 75:00 |

The selected Tuesday/Wednesday swap retains identical complete session content.
Intervals move from three calendar days before Friday to two; bench volume moves
from three days before Saturday to four. This is disclosed scheduling context,
not an assertion of equivalent fatigue or sufficient physiological recovery.
Thursday/Sunday remain rest days. A 60-minute Saturday is rejected even when its
profile is re-registered as trusted; there is no silent trimming.

## Verification

- New suite: 32 tests pass. Eight-file focused regression: 168 tests pass.
- Full TypeScript check and focused ESLint pass; `git diff --check` passes.
- Independent reviewer `/root/review_w5_integration` inspected the full source
  translation and independently ran all 32 tests. No blocking findings.
  The independent run preceded the final small source-fidelity/aliasing fixes;
  the reviewer inspected those final deltas and receipt without another run.
- Tests cover all five calculated totals, whole-session retention, changed
  spacing, missing preparation equipment, shorter budgets, source corrections
  and deletion, changed goals/symptoms/outside work, unknown schedules, malformed
  recipes, candidate tampering and input/output immutability.
- Accepted Markdown SHA256 remains
  `205356ebd232c632263a8c42a6fd0e9bfb2513aa9bdaf41b5107959a40f82cad`.
- Complete lowering digest is independently pinned in the test:
  `67207862e64280e27530407093f344c6a6f9aadb6ebb312b7791dbbc3c941a89`.

## Remaining boundary

This exact synthetic case does not prove general goal/coverage adequacy, a
five-by-60-minute launch week, full APEX programming or a numerical progression
rule. The fixture is not a default runtime registry. Some movement/equipment IDs
are case-local; the compiler checks declared equipment and exact context but
does not grant canonical catalog eligibility. Real rolling-week compiler/schema
integration, authenticated whole-week source binding, atomic athlete acceptance,
correction invalidation and persisted readback remain parent W5 work. P0/P1 and
W10/holdout gates remain separate. Numerical activation stays disabled.
