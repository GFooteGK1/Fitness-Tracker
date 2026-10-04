# Diagnose scene filtering before another routing policy

Greg approved diagnosing the partial-person/cropped-hand results. This slice is
local evaluation tooling and archived-score replay. Publication/remote execution
are separate actions. No phone policy, upload or meal-write change is included.

Independent pixel review found an annotation problem as well as a detector problem:
public-02 shows a red utensil handle, not a clear hand; public-13 has ambiguous
fabric rather than a clearly visible person. Preserve the original frozen 3/5
metric, append the audit, and do not call those two confirmed detector failures.
public-11 has a clear hand; public-12 has a clear clothed torso/arms. V2 passes
public-12 because it removed the old human semantic signal; the original signal's
margin was positive while all geometry counts were zero.

Implement a separate `scene-diagnostics` CLI mode with fixed profiles: full-body
512px, full-body 1024px and upper-body 512px. Record actual dimensions/orientation,
raw observation counts/confidences/rectangles and pose points before the fixed
0.2 confidence/two-point filter. Bound retained observations and point arrays;
report truncation. Preserve first-error checkpoints and all-stage completion.
The output has a distinct diagnostic version and cannot satisfy v2 composition.
Do not vary thresholds or manufacture a food-routing verdict from empty detections.

Prepare a separate v3 archived-score proposal restoring the original human-risk
contrast as an additional abstention. Keep food/context/geometry unchanged; never
turn a v2 abstention into a candidate. Freeze the proposal before replay and retain
both versions. Results remain exposed development evidence, not held-out acceptance.

Checks: raw-evidence validation, missing/truncated/filtered detection distinctions,
hash/provenance identity, diagnostic rejection by the routing composer, monotonic
candidate abstention and exact independent regrading. Independent review covers
the pixel audit, source and receipts. Native compilation/execution needs a Mac;
the prepared unsigned diagnostic workflow downloads only frozen public references
and owned controls, with no model download, provider calls or private images.

Lead/builder: main engineer. Independent reviewer: camera-probe reviewer. Beads is
unavailable in this checkout; use scoped board notes for continuity without closing
canonical tasks. Actual Mac raw detector evidence and a separately frozen challenge
set remain pending. Label disagreements do not silently shrink the old denominator.
