# Scene diagnosis: confirmed regression restored in archived replay

The local approved slice prepared executable-only native diagnostics and a separate
v3 human-semantic backup. Archived replay changes exactly one of 32 decisions:
`public-12`, a clearly visible clothed torso/arms scene, becomes uncertain again.
No model or detector was rerun. New native source still needs Mac compilation and
execution. The phone policy and automatic meal logging remain unchanged.

## Pixel audit and the confirmed cause

The independent evaluation reviewer inspected full source pixels and verified hashes
against the frozen manifest. The main engineer separately inspected the same pixels.

| Case | Pixel evidence | V2 evidence | Audit finding |
| --- | --- | --- | --- |
| public-02 | Pizza and red utensil handle | Candidate; four accepted detector counts zero | Existing human label unsupported |
| public-11 | Cropped fingers, sleeve/partial torso | Uncertain; hand count one | Human presence confirmed; no routing miss |
| public-12 | Clothed torso/arms, head outside frame | Candidate; four accepted detector counts zero | Confirmed regression |
| public-13 | Bananas, fabric/bags and ambiguous edge | Candidate; four accepted detector counts zero | Human presence uncertain |

The earlier statement that all three passing flagged scenes visibly contained people
was too strong. Frozen labels, reports and the v2 **3/5** metric remain unchanged.
The portable independent audit preserves all findings, replaces local absolute paths
with frozen manifest-relative files, and records its original audit hash. It does
not silently relabel cases, revise the denominator or establish privacy acceptance.

For `public-12`, the archived human-risk score exceeds the strongest original safe
score by **1.9107818603515625**. V2 removed that semantic check; its remaining context
margin is **-0.8468503952026367** and all four accepted geometry counts are zero.
That explains the routing regression. The saved counts cannot explain whether
Vision produced no raw observations or rejected low-confidence points. Native
diagnostics are prepared to answer that question.

## Frozen v3 proposal and replay

`scene-policy-v3.json` was frozen before replay. It uses the unchanged original
people/hand/face risk and meal/food/package/drink safe prompts. A nonnegative human
margin can only demote a v2 candidate to uncertain. Food/context/geometry decisions
otherwise remain unchanged. No previous abstention can become a candidate.

| Exposed development measure | V2 | V3 archived replay |
| --- | --- | --- |
| Clear meals | 11/11 | 11/11 |
| All real food | 17/19 | 16/19 |
| Real non-food false passes | 0/7 | 0/7 |
| Frozen sensitive false passes | 3/5 | 2/5 |
| Public uncertain outcomes | 8 | 9 |
| Execution errors | 0 | 0 |

Only `public-12` changes. The two remaining frozen sensitive false passes are
`public-02` and `public-13`, with disputed human labels. This is a development repair,
not evidence of general privacy protection. There is no untouched challenge holdout.
Both v2 and v3 summaries explicitly leave automatic uploads unqualified. Source
durations and `generatedAt` are inherited archived measurements; `replayGeneratedAt`
and `execution` identify the new replay. These durations are mixed component times,
not v3 execution or end-to-end latency.

| New frozen receipt | SHA-256 |
| --- | --- |
| scene-policy-v3.json | c7cfecf3a497e6ca0cbed335f71d6f18d56f93bc25947c3ddd26d9bf1ac58d15 |
| manifest.json | 328140e3fdd05fcacf42cea20aac197f761949bac0837c91bffc125d7fb764b4 |
| results.json | 5aad0a9f10e65066465e7b8473585d55763eef172995a3cfb017bff7f4582a5a |
| summary.json | e43e9886f77bbe55151fb695d78b1bafc2e380fd96beae56966a4737b89ffc93 |
| label-audit.json | dd206bf75e225a0b0767b8400f36195032c15dbcda884b5b62d31c81c586b590 |

The four public replay/audit receipts are under
`scripts/eval/local-food/results/human-backup-v3-20261004/`. V2 source receipts are
the exact retained artifacts from Mac run 37218964987; archived semantic source is
`results/siglip2-windows-20261004/results.json`. Source hashes are recorded in the
reports. Independent exact regrading preserves the existing v2 summary.

## New native diagnostic contract

`LocalSceneDiagnostics.swift` belongs only to the evaluation executable, with no
app/runtime calls. Fixed profiles are full-body 512px, full-body 1024px and upper-body
512px. It retains actual pixel dimensions, transformed orientation, request revisions,
raw counts, observation confidence/rectangles, pose points, accepted counts and result
availability. Threshold 0.2, two pose points and four maximum hands remain unchanged.

At most 64 observations per stage and 32 points per observation are encoded, with
full counts and explicit truncation. Landmark names are not retained; this first
diagnosis addresses absence versus filtering, rather than anatomical interpretation.
CPU-only Vision requests use cooperative cancellation after 20 seconds per profile.
The outer job timeout is 20 minutes; cancellation is not a guaranteed hard deadline.
The first failed profile/case stops, preserving an atomic partial checkpoint and
error domain/code without localized error text or file paths.

`diagnose_scene.py` validates complete exact case/hash/profile/preprocessing metadata
and classifies evidence as unavailable, no raw observations, retained detections or
filter rejection. Its distinct version cannot satisfy the v2 routing composer.
Neither empty observations nor filtered points establish that a scene has no person.

## Verification and prepared next action

Local verification passed **27 Python contracts**, **8 signing workflow contracts**,
exact v2/v3 regrading, monotonic outcome comparison, frozen source-byte comparison,
Python syntax parsing, workflow YAML structure checks and `git diff --check`.
The first contract run exposed an incorrect expected exception for exclusive writes;
the test now expects `FileExistsError`. The first CLI replay lacked its new output
directory; no receipt was created. Creating the directory allowed the single completed
replay. Old receipts were never overwritten. These were local contract/setup fixes.

The existing independent reviewer found no blocking source issues.
Independent final review regraded v3 exactly, recomputed every human margin and
verified source lineage and the portable audit. Only `public-12` was demoted.
New Swift
compilation and real raw diagnostic execution remain unverified on Windows.
The retained prior FP32 run establishes only the previous source's compilation and
Core ML parity; it cannot validate this diagnostic addition. Beads is unavailable
here, so no canonical task or milestone was closed. Board notes preserve continuity.

The concrete publication selection is 25 files: workflow parent/child, attributes,
architecture map, plan and two verification receipts, two native evaluation sources,
README, two Python tools, contracts, diagnostic requirements and v3 policy, six exact
prior FP32 Mac JSON receipts and four new v3/audit JSON receipts. Four unrelated
diagnostic/support paths remain excluded. No public images, personal photos, models,
credentials or generated runtime state are included.

Next action for target-specific approval: commit/push that reviewed selection to
`codex/auto-meal-photos-probe`, then dispatch one `ios-compile.yml` run on its exact
revision with `target=scene-diagnostics`. The existing unsigned compile job and the
new diagnostic job use frozen public fixtures/owned controls, retain JSON for 30 days,
and make no provider/model calls. There is no signing, TestFlight upload, phone-policy
activation, photo upload or canonical meal write. Review the actual raw outputs before
freezing a separately grouped partial-person/hand challenge set or choosing routing
behavior. Phone observation and macro-review integration remain later slices.
