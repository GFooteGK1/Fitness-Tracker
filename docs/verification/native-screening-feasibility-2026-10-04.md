# Native screening feasibility: local evidence

The image-only encoder export passed on Windows. Native scene checks and the Mac
conversion workflow are prepared and independently reviewed as evaluation source.
Neither native execution nor phone feasibility has been proved. No publication,
workflow dispatch or TestFlight distribution occurred in this slice.

## Actual export

The frozen Google SigLIP2 model revision is
`75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2`. The export uses Torch 2.8.0 CPU,
the exact frozen prompt configuration and all 32 exposed development inputs.
It reloads the saved TorchScript encoder and compares logits and original v1
outcomes against both eager inference and the archived Windows report.

| Observation | Result |
| --- | --- |
| Complete input parity | 32/32 |
| Largest observed logit difference | 0.0 |
| Original v1 outcomes preserved | 32/32 |
| Image encoder | 371,840,052 bytes |
| Text-vector JSON | 528,913 bytes; 24 vectors, 768 dimensions |
| Saved encoder parameters | 209 keys, all in the vision model |

This measures logit/outcome parity, not explicit vector-by-vector parity. The
encoder file size does not establish a Core ML package size, resident memory,
load/inference latency, battery cost or background execution on a phone.

The public numerical receipt is
`scripts/eval/local-food/results/native-export-windows-20261004/parity.json`.
Its SHA-256 is `d84bded7f64d00ae3355c9c4a9fe0cb1effc016014f2fda1a1c3ae8ecde4ac75`.
The encoder SHA-256 is
`17c9fd4470e0478bb1c9957ac7ff1bee26b03278e12c7ab08cbaf2f57d83ba1e`.
Encoder, vectors and processed pixel tensors remain in ignored local data. The
independent reviewer rehashed those artifacts and all 32 tensors.

## Prepared proposal

`LocalSceneGuard.swift` uses CPU-only Apple Vision face, human rectangle, body pose
and hand pose requests with fixed revisions and confidence 0.2. Any detected human
geometry abstains. A missing, failed or invalid batch also abstains. Completed runs
record all four stages; failed batches do not report individual-stage completion.
Screen/document/medical similarity contrasts against food presence separately.
None of this code is called by the app runtime or migrates saved v1 classifications.

The frozen v2 decision configuration SHA-256 is
`305c6321c9d233931e144e7788a767d1f5b693a07f0c9342922468ab462f1df5`.
Composition rejects changed prompt configurations before interpreting archived
scores, mismatched image/report identities and overwrite attempts. It retains
source report hashes and never qualifies automatic uploads.

Checks run locally: 21 Python contracts passed, including changed prompt grouping,
missing/failed scene evidence, screenshot precedence and changed tensor rejection.
Eight signing-workflow contract tests passed. Python source and both workflow YAML
files parsed, and `git diff --check` passed. Geometry observations in contract tests
are explicit mocks. Swift tests and compilation could not run on this Windows host.
Beads is unavailable here; no canonical issue was closed.

## Concrete next action, pending authorization

Commit and push only the evaluation files on `codex/auto-meal-photos-probe`, then
dispatch the existing `ios-compile.yml` once with `target=screening-feasibility`.
That dispatch runs the existing unsigned app/extension compile and a reusable
45-minute Mac job. The latter installs isolated pinned tooling, re-exports against
the Windows baseline, converts to FP16 Core ML, reloads the saved package and checks
CPU prediction logits within 0.05 with exact original outcomes. It then runs real
native geometry on the public development fixtures and grades the separate v2
proposal. Only selected JSON receipts are retained for 30 days.

No personal images, app signing, TestFlight release or meal writes are included.
The untouched grouped holdout, real screen/document/medical coverage, Swift pixel
preprocessing parity and locked iPhone measurements remain later requirements.

Apple documents [PyTorch conversion](https://apple.github.io/coremltools/docs-guides/source/convert-pytorch-workflow.html)
and [macOS model prediction](https://apple.github.io/coremltools/docs-guides/source/model-prediction.html).
Core ML Tools 9.0's [dependency checks](https://github.com/apple/coremltools/blob/9.0/coremltools/_deps/__init__.py)
set the tested Torch ceiling to 2.7.0. The Mac job therefore pins that version and
must establish parity rather than reusing the Windows version assumption.
