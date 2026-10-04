# Native screening Mac run: conversion parity failed

Greg approved the exact evaluation package commit/push and one unsigned Mac
verification on October 4. Commit `5bc617e0e885838276b0a9576e546587cf6c677e`
contains the 34 reviewed files. The branch was pushed normally and the exact remote
SHA read back. Unrelated untracked diagnostic/support files remain excluded.

The single [run 37216877996](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/37216877996)
ran on that commit and finished with **failure** after 4 minutes 23 seconds.
The unsigned compilation job passed; the feasibility job stopped on numerical
parity. No rerun, TestFlight upload, runtime adoption or meal write occurred.

## Verified results

| Check | Actual result |
| --- | --- |
| Unsigned app and extension | Compiled successfully, 2 minutes 19 seconds |
| Python contracts | 21 passed |
| Swift Testing | 53 passed |
| Scene-policy XCTest | Five passed; these do not execute real detectors |
| Mac Torch 2.7 export | 32/32 original v1 outcomes preserved |
| Maximum Mac/Windows logit difference | 0.00005435943603515625, below 0.0001 |
| FP16 Core ML conversion and saved-package reload | Completed on Mac CPU |
| Core ML package size | 184,740,681 bytes |
| Conversion / saved package loading | 5,504 ms / 1,367 ms |
| First CPU prediction, public-01 | 143 ms; same classification |
| First prediction's largest logit difference | 1.5491466522216797, above 0.05 |
| Remaining Core ML cases | Not attempted after the failure |
| Real native scene detection / v2 composition | Skipped after conversion failure |

The exact failure was `ValueError: Core ML parity failed; receipt preserved`.
One unchanged classification does not establish parity for the remaining inputs.
The reduced model converted, but its numerical behavior failed acceptance. Device
latency, memory, battery, preprocessing and locked execution remain unverified.

## Retained evidence

Selected JSON artifacts were successfully retained by the workflow and downloaded
to ignored `scripts/eval/data/local-food/publication-20261004-01/mac-artifacts/`.
The exact public observation bytes are also preserved in
`scripts/eval/local-food/results/native-macos-37216877996/` for the next publication
package. No images, tensors, text vectors or model binaries were retained remotely.

| Receipt | SHA-256 |
| --- | --- |
| export-parity.json | 07ff5624e683238018c6bde6fb30d2eaa41554473661fc18591f6636247f7287 |
| coreml-parity.partial.json | 5a6df648e16d8303b8e0e7bf88d458c0534b32283f7ac15d60a11d8b9c50f7ee |

The incomplete Core ML receipt binds the exact export receipt. Its single case is
not relabelled as a completed result. The independent reviewer checked run identity,
test logs, all 32 Mac export observations and the failed partial receipt.
This is unresolved conversion acceptance failure **1**; it is separate from the
previously resolved desktop setup failures in the SigLIP comparison receipt.

## Prepared diagnostic, pending separate publication and run authority

Use explicit FP32 conversion with the same frozen model, prompts, pixels,
CPU compute units, original outcomes and maximum logit error 0.05. Stop at the
first parity failure and preserve a new receipt. Keep FP16 as the default so the
existing command is not silently changed. The new `--precision` argument rejects
unsupported values and records the selected precision before conversion.

Run independent scene checks after a successful fixture/export stage, even if
Core ML conversion fails. Do not use `continue-on-error`; conversion failure must
still fail the overall workflow. Missing/failed scene evidence still abstains.

The proposed remote action is a commit/push of only the reviewed follow-up files,
then one dispatch of `ios-compile.yml` on `codex/auto-meal-photos-probe` with
`target=screening-feasibility` and `screening_precision=FLOAT32`. It stays unsigned
and retains only selected JSON. No further remote action is authorized by the
one completed dispatch approval. Phone integration remains a separate stage.

Apple documents [FP32 conversion for precision-sensitive models](https://apple.github.io/coremltools/docs-guides/source/typed-execution.html).
The [debugging utilities](https://github.com/apple/coremltools/blob/main/docs-guides/source/mlmodel-debugging-perf-utilities.md)
compare source/converted or FP32/FP16 models to locate inconsistent operations.
FP32 is a diagnostic hypothesis, not a confirmed cause or guaranteed correction.
If it also fails, preserve failure 2 and reassess conversion before another run.

The prepared follow-up passed 22 Python contracts, eight signing contracts,
Python/workflow parsing, precision-routing/scene-failure-semantics inspection,
exact receipt-byte checks and `git diff --check`. Independent review accepted it
for scoped publication and one diagnostic run. These checks do not establish FP32
conversion parity. The follow-up remains uncommitted and unpushed.
