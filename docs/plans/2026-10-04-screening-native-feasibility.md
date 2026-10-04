# Native screening feasibility and independent scene checks

Greg approved the next slice after the October 4 local comparison. Implement and
verify what can run locally, then prepare the exact unsigned macOS verification
job. A commit/push and workflow dispatch require scoped authorization; a physical
iPhone proof and TestFlight remain later steps. No cloud inference or photo upload.

## Selected approach

Keep SigLIP2's fixed semantic food descriptions. Export only its image encoder and
precompute the text vectors, scale and bias. Verify eager versus traced logits and
original policy outcomes on every frozen development fixture. The encoder returns
normalized vectors; explicit vector-by-vector parity is not measured in this slice.
Prepare Core ML conversion and CPU-only prediction parity using the same input
tensors. Tensor preprocessing parity is separate from future Swift/Photos resizing.

Separate scene evidence from food presence. Apple Vision face, full-body rectangle,
body pose and hand pose requests supply independent geometric evidence. Every
request must complete on CPU; unavailable, failed, malformed or incomplete evidence
must abstain. Fixed confidence 0.2; pose requires at least two supported points.
Keep screenshot abstention. The semantic document/screen/medical contrast compares
against actual food descriptions, rather than the unrelated isolated-scene wording.
This is an unqualified v2 development proposal; it must not reinterpret saved v1.

Rejected for this slice: lowering v1's risk margin to pass the observed package;
bundling the full 1.50 GB image/text checkpoint; silently upgrading the phone store;
sending the photo library to an external vision provider.

## Acceptance and limits

- Exclusive new export/report directories; hash-bind model, policy, preprocessing,
  traced encoder, text vectors and every actual decoded image. Preserve failures.
- All 32 eager/traced logits agree within 0.0001 and original outcomes match exactly.
- macOS Core ML CPU logits within 0.05, exact original outcomes; report conversion,
  package size, loading and inference time without calling it phone performance.
- Geometry requests pin revisions, use oriented <=1024px local pixels, CPU-only
  stages and cooperative cancellation. Report every case and all-stage completion.
  A failed batch abstains; it does not identify which individual detector completed.
- Policy contract checks cover missing/failed evidence, NaN, people/hands,
  screenshot precedence, context abstention and food/non-food boundaries.
- Independent code/risk/evidence review before publication or device integration.
- An untouched grouped set of packaged food, real screens/documents, medical and
  people/hands must be independently frozen before quality qualification. Current
  32 cases remain exposed development regressions; no holdout acceptance is invented.

Lead/builder: Codex main engineer. Independent reviewer: camera-probe reviewer.
Verifier: offline contracts, actual Windows encoder export/parity, then separately
authorized macOS conversion/scene execution. Native compile/prediction is unavailable
on this Windows host. The app does not consume the exported encoder or new policy.

The proposed remote action is one dispatch of the existing `ios-compile.yml` on
`codex/auto-meal-photos-probe`, with `target=screening-feasibility`. It runs the
existing unsigned app/extension compile job plus the reusable Mac feasibility job.
Neither job signs or distributes an app. Publication and dispatch are pending.
