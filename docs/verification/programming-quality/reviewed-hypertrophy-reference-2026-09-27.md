# Accepted hypertrophy reference and compiler comparison

Canonical task: `Fitness-Tracker-i40.1.6`. Manual work resumed after Greg confirmed
the RPE-corrected week with "looks good now" and asked to resume goal work.

## Delivered

`test/fixtures/reviewed-hypertrophy-week.json` captures the reviewed working
prescriptions, per-set target RPE, rest, side counts and timing assumptions. It
retains unknown loads/actual effort and qualitative review scope. It binds the
complete source document with canonical-LF SHA256
`93ed63584428468d0e75421be875b4240c3b37961d610a2489f88e9403f29998`.
The fixture's own canonical-LF hash is
`16e434f78f903a18221a0191385571b09572a029ffa2c5b5da2a538e1e8c898d`.
Detailed preparation repetitions, stop rules and follow-up remain in the bound
source; this is an offline reference, not a new runtime plan format.

`scripts/programming-quality-reviewed-week.ts` verifies the reference against the
actual source table before comparing it to a real current `runBaselineCase` result.
It rejects source/input drift, changed dose or sides, inferred actuals and elevated
review authority. Case identity and input hash are preserved from the frozen
development case. No current or historical athlete data is used.

## Verified current gaps

Source checkout HEAD: `d8a14817f0cc77281447722c378eef8ba1be41bf`, with the existing
uncommitted work preserved. This receipt covers the new local files, not that
commit's CI. Comparison produced:

| Mechanical observation | Result |
| --- | --- |
| Current compiler working prescriptions | 6 |
| Explicit working RPE targets | 0; all6 supply other effort targets |
| Preparation exercises without explicit RPE targets | 3 |
| Accepted exercise variants without an exact active catalog entry | 14 of15 |
| Reviewed day/exercise entries not reproduced by the current compiler | 15 |
| Reference time including upper reps/rest, preparation and transitions | 46:30 / 50:36 / 50:06 |

The compiler schema can represent RPE as an execution-target alternative; this
hypertrophy path currently supplies RIR instead. The comparison does not silently
convert that into an explicit RPE prescription. Exact-name/day differences do
not establish that every alternative is inappropriate. They identify work for
the selection/catalog repair and subsequent qualified comparison. Generic
full-gym equipment still does not confirm each named machine. No quality score,
automatic equivalence, live approval or numerical activation is produced.

The ignored diagnostic is
`output/programming-quality-review/reviewed-hypertrophy-compiler-gaps.json`.
Reproduce with PowerShell:

```powershell
$env:PROGRAMMING_REVIEWED_WEEK_REPORT = '1'
npx vitest run test/coach/programming-quality-reviewed-week.test.ts
```

This writes only the diagnostic; it never replaces `baseline-report.json`.
Without the environment variable, the checks do not write a report.

## Verification and next boundary

All10 focused tests, full worktree typecheck and focused ESLint passed. Tests
cover real compiler output, stale source/input, dose/RPE/side-count drift,
invented actual effort/load, inflated authority, RIR versus explicit RPE, and a
blocked compiler. The first run passed its10 tests but failed to save the
diagnostic due to local output-directory EPERM; the access-approved rerun passed
and its saved JSON was read back. No hosted, provider or database call occurred.

Focused main-thread risk review found no runtime imports of the new helper,
network client, credential access, holdout read or acceptance/policy mutation.
This closes the reference/comparison child only. `i40.6.3` remains unimplemented;
P0's remaining adjudication and suitable bench-continuity base, plus P3/P4
dependencies and policy review, remain explicit. Do not preserve these observed
defects as permanent requirements when the real implementation is corrected.
