# FP32 native screening: conversion passed, privacy quality failed

The approved 10-file follow-up was committed as
`24fdf970ba46790785d10da8d3de44def5b7b955`, normally pushed to
`codex/auto-meal-photos-probe`, and verified against GitHub's exact branch SHA.
The selected paths and cleaned Git content matched the reviewed manifest. Unrelated
diagnostic/support files remain untracked and excluded.

The single approved [run 37218964987](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/37218964987)
used `target=screening-feasibility` and `screening_precision=FLOAT32` on that commit.
Both jobs succeeded: unsigned compilation in 2 minutes 5 seconds and feasibility
in 3 minutes 51 seconds. Green execution does not establish privacy acceptance.
No rerun, TestFlight distribution, app adoption, upload or meal write occurred.

## Technical evidence

The Mac job passed 22 Python contracts, 53 Swift Testing tests and five scene-policy
XCTest tests. App and extension compilation succeeded. All 32 image encoder exports
preserved v1 outcomes against the archived Windows baseline, with maximum logit
difference 0.00005435943603515625. The export hash is the same as the prior Mac run.

FP32 Core ML conversion and saved-package CPU reload succeeded. All 32 predictions
preserved the original v1 outcomes. Maximum logit difference was
**0.00006961822509765625**, below the unchanged 0.05 tolerance. The saved package
was **369,313,298 bytes**, conversion took 4,676 ms and loading took 2,007 ms.
Nearest-rank CPU prediction p50/p95 were 45/56 ms, with range 45–176 ms.
These Mac timings exclude preprocessing, model loading and Photos access.

The prior FP16 receipt remains failed and immutable: its first case drifted by
1.5491466522216797. FP32 avoids that observed drift on this development set. The
exact operation responsible has not been identified. Conversion acceptance failure
1 is resolved for the FP32 variant, not reclassified as a successful FP16 run.

## Actual scene-filter quality

All 32 CPU geometry batches completed with pinned revisions and confidence/point
limits. Independent regrading of the separate v2 observations matched the saved
summary exactly:

| Development category | Result |
| --- | --- |
| Clear meals | 11/11 candidates |
| All real food | 17/19 candidates |
| Real non-food false passes | 0/7; six abstentions, one non-food decision |
| People/body-part challenge false passes | **3/5** |
| Synthetic controls | Five abstentions, one non-food; zero errors |

`public-02`, `public-12` and `public-13` passed with the frozen sensitive flags.
All four retained detector counts were zero in these cases. A subsequent direct
pixel audit confirmed a torso/arms only in `public-12`: `public-02` shows a red
utensil, and `public-13` has ambiguous fabric. The original statement that all
three show visible people was too strong. Frozen receipts and the 3/5 denominator
remain unchanged; see `scene-diagnostic-audit-2026-10-04.md` for the appended audit.
The receipts cannot distinguish absent raw observations from confidence/point
filtering. `public-11` correctly abstained on a detected hand. `public-22`, a dog,
produced a human-body pose count, showing a false detection as well.

The proposed v2 gate regresses sensitive protection from the old semantic probe's
2/5 false passes to 3/5: `public-12` becomes a candidate after removal of the old
semantic risk check. Do not adopt v2 as an upload gate. No runtime policy was changed.

Composition uses archived Windows semantic logits plus actual Mac geometry. It is
not an integrated Core ML classifier. Combined v2 durations are component timings
from different runs/platforms and must not be presented as end-to-end latency.
The development set is exposed; no untouched holdout or real photographed screen,
document or medical qualification is established. No claim covers iPhone memory,
battery, pixel preprocessing or locked execution.

## Evidence and next scope

JSON artifacts were successfully retained and downloaded to ignored
`scripts/eval/data/local-food/publication-20261004-02/mac-artifacts/`.
Six exact public receipts are preserved locally under
`scripts/eval/local-food/results/native-macos-37218964987/`. These post-run files
and this receipt have not been committed or pushed.

| Receipt | SHA-256 |
| --- | --- |
| coreml-parity.json | a0088f2dbee445c4505ae80fdb613d31d34cd75eec747c83a9fd9bba38d2d430 |
| scene.json | 924174364faa750d0338abb17d71e4e86ba7036351edd330672ac4d9f3d1559f |
| v2-manifest.json | 2f5bec2500f0c62d96c8eff4995c1b15399933b82a33560bb7a218f8599b4563 |
| v2-results.json | 82c9dcd4fd5e6604a24505342bd66b5605700ed91a7bf4386e44c0c19dcb897d |
| v2-summary.json | 3aeb745d20a19b1edb045c2e373897702293de76212fcc2065ef0ec8b7da4b1a |

Independent review verified commit scope, run/test identity, source lineage, all
32 Core ML outcomes and exact v2 regrading. Technical feasibility is accepted;
privacy quality is not. Beads is unavailable here; no canonical issue was closed.

Next, diagnose the people/body-part coverage gap before another policy proposal:
preserve bounded per-detector raw counts, confidence and pose-point evidence; add
independently frozen cropped-hand/partial-person challenge cases; and compare
geometry with the retained semantic risk signals. Do not tune or relabel v2, lower
its acceptance criteria, or treat empty detections as proof of a safe scene.
Model/scene qualification and physical-device observation remain separate steps.
