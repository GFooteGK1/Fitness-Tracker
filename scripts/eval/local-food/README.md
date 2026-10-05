# Local food-presence evaluation

This evaluates the on-device screening candidate before any photo upload. It uses
Apple Vision revision 1 on CPU and `LocalFoodScreeningPolicy` from the same Swift
source as the phone. No Jev, provider credentials or nutrition calls are involved.
Expected answers are frozen before inference. Phone development labels are optional;
Greg need not label this reference set.

## Run

From the repository root, with Python 3.9+:

```sh
python3 -B -m unittest discover -s scripts/eval/local-food -p 'test_*.py'
python3 -B scripts/eval/local-food/fetch.py scripts/eval/local-food/fixtures.json scripts/eval/data/local-food
```

On macOS 14+ with Swift 6:

```sh
swift run --package-path ios LocalFoodEval scripts/eval/local-food/fixtures.json scripts/eval/data/local-food scripts/eval/data/local-food/vision-run-001.json
python3 -B scripts/eval/local-food/score.py scripts/eval/local-food/fixtures.json scripts/eval/data/local-food/vision-run-001.json scripts/eval/data/local-food/summary-run-001.json
```

Choose fresh output filenames. Final reports and earlier checkpoints are never
replaced. Each invocation creates a separate `.partial.json` checkpoint and updates
that file atomically after every classification. If inference hangs or the job stops,
grade the partial report with the same command: absent cases count as errors/misses.
The unsigned native CI workflow runs the evaluation after compilation and retains
JSON reports, including partial evidence on ordinary step failure, for 30 days.
Abrupt runner loss or a job-level timeout can prevent artifact upload; checkpoint
creation does not guarantee remote retention. Images and local
reports in `scripts/eval/data/` are ignored by Git. No schedule or activation is added.

## Rubric

- Food presence means visible edible food or drink, including packaged or growing
  food. It does not establish consumption or an estimable portion.
- A clear meal has a central prepared portion. Packaged shelves, growing fruit,
  drinks, stored leftovers and meals mixed with people are separate categories.
- A candidate on non-food is a false pass. Uncertain, error and missing food results
  are misses for automatic routing, even when abstention is sensible.
- People/body parts and screenshot metadata are separate challenge flags. A candidate
  on a flagged scene is a sensitive false pass regardless of food presence.
- Score food/clear-meal recall, non-food and sensitive false passes, uncertainty,
  errors, and nearest-rank p50/p95 classifier duration. Missing cases have no invented
  timing and remain in recall denominators.

Report evidence layers (public, synthetic, private device) and development/held-out
splits separately. Reports bind manifest/image SHA-256 hashes, policy/revision, OS
and preprocessing. Unknown/duplicate cases, changed pixels, wrong manifests and
cross-split image groups fail validation. Expected answers are not passed to Vision.
Same-scene rice and granola photos share groups. No overall accuracy is pooled across
layers or splits, and the grader never grants automatic-upload qualification.

The starter set has **21 development references: 19 food, two cats**, with 11 clear
meals and five scenes containing people/body parts. Codex inspected all pixels before
inference; these are provisional development labels, not expert adjudication. There
is no untouched holdout. Documents, photographed screens, medical scenes, broader
non-food scenes and a close-up packaged-food case like Greg's granola bag remain
coverage gaps. Read category counts alongside aggregate scores.

macOS uses an oriented 512px ImageIO thumbnail. The phone reads through Photos with
downloads disabled and passes image orientation. Vision and policy are shared, but
preprocessing, OS assets, hardware, Photos availability and locked execution differ.
CLI timing covers Vision/policy; phone timing includes image access. Neither establishes
battery/memory behavior. Cancellation is cooperative and can exceed ten seconds.

## Use the results

The first actual macOS baseline at `eb22651` completed all 21 cases. It passed
8/19 food images and 5/11 clear meals, excluded both cats, and passed 3/5 scenes
flagged for people/body parts. Nine cases were uncertain; none errored. The v1
policy remains observation-only. See [the receipt](../../../docs/verification/local-food-evaluation-2026-10-03.md)
and immutable public JSON observations under `results/eb22651-macos-26-6-2/`.
Unlike ignored local caches, these public baseline reports are checked in.

1. Run the unchanged candidate and inspect failures/reasons before tuning thresholds.
2. Expand representative negatives and packaged food; independently adjudicate a
   separate grouped holdout. Do not tune against the holdout.
3. Compare frozen baseline and candidate on the same OS and preserve both receipts.
4. Review clear-meal recall (proposed target 95%), observed sensitive false passes
   (target zero), broader false-pass/abstention coverage and physical locked execution.
   These proposed gates need sufficient coverage and review; they are not guarantees.
5. Implement authenticated Socius analysis into review drafts with duplicate prevention,
   recovery and explicit meal acceptance after the routing decision is qualified.

If general Vision misses food badly, compare another image-capable classifier/provider
under a separate scoped decision. Jev may judge text observations later; it cannot
read these images directly.

## SigLIP2 desktop comparison

This separate development probe uses a fixed Google image/text encoder and text
descriptions to compare food, non-food and scene-risk similarity. It does not change
the Swift policy or send photos to a service. `foodConfidence` is a logistic transform
of a relative similarity margin, **not a calibrated food probability**. The frozen
margin policy was chosen before outputs; do not tune it against this dataset.

`fixtures.siglip2-development-v1.json` preserves the original 21 cases and adds five
CC0 non-food photos plus six owned synthetic controls. All 32 are development cases.
The controls are drawn documents, phone-shaped UI and abstract backgrounds, not real
photographed screens, documents or medical scenes. The model sees pixels and fixed
text prompts only; it receives no expected answers. A screenshot metadata flag is an
explicit abstention control and is not learned screen detection.

Use Python 3.13 and a separate ignored environment, for example:

```sh
python -m venv scripts/eval/data/local-food/venv-siglip
scripts/eval/data/local-food/venv-siglip/Scripts/python.exe -m pip install -r scripts/eval/local-food/requirements-siglip.txt
```

On macOS/Linux use `bin/python` in that environment instead. Run with that Python:

```sh
python -B scripts/eval/local-food/siglip_probe.py download scripts/eval/local-food/siglip-probe.json scripts/eval/data/local-food/models
python -B scripts/eval/local-food/make_controls.py scripts/eval/data/local-food
python -B scripts/eval/local-food/fetch.py scripts/eval/local-food/fixtures.siglip2-development-v1.json scripts/eval/data/local-food
python -B scripts/eval/local-food/siglip_probe.py run scripts/eval/local-food/siglip-probe.json scripts/eval/local-food/fixtures.siglip2-development-v1.json scripts/eval/data/local-food MODEL_DIRECTORY scripts/eval/data/local-food/siglip-run-001.json
python -B scripts/eval/local-food/score.py scripts/eval/local-food/fixtures.siglip2-development-v1.json scripts/eval/data/local-food/siglip-run-001.json scripts/eval/data/local-food/siglip-summary-001.json
```

`MODEL_DIRECTORY` is the immutable snapshot path printed by `download`. The public
weight download is approximately 1.50 GB. Only that download uses the network; the
run loads local safetensors with remote code disabled on CPU. An input or weight hash
mismatch stops before inference. Any inference exception stops after preserving the
first error checkpoint. Choose fresh report names after diagnosis. Generated controls
must match their frozen hashes; do not silently regenerate changed bytes after a
Pillow update. No scheduled run or paid provider credential is needed.

For the original baseline comparison, extract its manifest's exact Git bytes:

```sh
python -B -c "import pathlib,subprocess; pathlib.Path('scripts/eval/data/local-food/baseline-manifest.json').write_bytes(subprocess.check_output(['git','show','eb2265189f9cd23e7a113c9203be8c9a32641409:scripts/eval/local-food/fixtures.json']))"
python -B scripts/eval/local-food/compare.py scripts/eval/data/local-food/baseline-manifest.json scripts/eval/local-food/results/eb22651-macos-26-6-2/food-vision-results.json scripts/eval/local-food/fixtures.siglip2-development-v1.json scripts/eval/data/local-food/siglip-run-001.json scripts/eval/data/local-food/comparison-001.json
```

Comparison rejects changed pixels/rubrics and incomplete final reports. Additional
cases appear only in the candidate's broader suites; no baseline result is invented
for them. Desktop CPU and macOS Vision timing cannot be compared directly. Model
loading and text-vector preparation are excluded from per-image times. The full
model is not a phone-size proposal. Core ML conversion, RAM, app size, battery and
locked physical-device execution remain unverified. The grader cannot qualify uploads.

The October 4 CPU run completed 26 real references plus six synthetic controls.
On the same original 21 images it passed 11/11 clear meals (Vision: 5/11), but
still passed 2/5 scenes flagged for people/body parts. The broader non-food false
pass count was 0/7, with five of those seven abstaining rather than receiving a
non-food classification. All six synthetic controls abstained. A separate local
check of previously shared user references marked the food package uncertain and
the cat non-food. This remains a development comparison and does not qualify uploads.
See [the comparison receipt](../../../docs/verification/local-food-siglip-comparison-2026-10-04.md)
and public raw observations under `results/siglip2-windows-20261004/`.

The supporting-artifact file pins small Git blobs and LFS content hashes separately;
the report records observed SHA-256 values for all six files. The Windows development
lock records all 28 resolved packages; the shorter requirements file pins direct
evaluation dependencies. Neither is an application dependency. Synthetic pixel
reproduction also depends on the pinned Pillow release.

## Image encoder and native scene feasibility

The October 4 Windows export removes the text encoder and saves a normalized image
encoder plus fixed text vectors. It preserved all 32 original policy outcomes and
had zero observed logit difference against eager inference and the archived run.
The image encoder is 371,840,052 bytes; this does not establish phone memory or size.
See [the native feasibility receipt](../../../docs/verification/native-screening-feasibility-2026-10-04.md).

Run the export with the isolated SigLIP environment and a fresh output directory:

```sh
python -B scripts/eval/local-food/encoder_export.py scripts/eval/local-food/siglip-probe.json scripts/eval/local-food/fixtures.siglip2-development-v1.json IMAGE_DIRECTORY MODEL_DIRECTORY scripts/eval/local-food/results/siglip2-windows-20261004/results.json EXPORT_DIRECTORY
```

On macOS use a separate Python 3.11 environment with `requirements-coreml.txt`.
It pins Torch 2.7.0 to Core ML Tools 9.0's tested range. Re-export on that environment
against the archived Windows observations; do not assume cross-version parity.
Core ML prediction requires macOS, and this converter requires it explicitly:

```sh
python -B scripts/eval/local-food/coreml_feasibility.py EXPORT_DIRECTORY COREML_DIRECTORY --precision FLOAT16
swift run --package-path ios LocalFoodEval scripts/eval/local-food/fixtures.siglip2-development-v1.json IMAGE_DIRECTORY SCENE_REPORT scene
python -B scripts/eval/local-food/compose_scene.py scripts/eval/local-food/fixtures.siglip2-development-v1.json scripts/eval/local-food/results/siglip2-windows-20261004/results.json SCENE_REPORT V2_MANIFEST V2_REPORT
python -B scripts/eval/local-food/score.py V2_MANIFEST V2_REPORT V2_SUMMARY
```

The proposed geometry policy uses completed CPU face, human rectangle, body pose
and hand pose requests. Missing, failed or invalid evidence abstains. Context
similarity remains experimental. Composition binds archived semantic scores to
the exact prompt configuration and preserves source-report hashes in a new receipt.
Partial composition timings cover only available components. Synthetic contract
tests use explicitly marked fake geometry and do not establish detector quality.

The prepared `ios-compile.yml` target `screening-feasibility` runs unsigned native
compilation and the reusable Mac conversion/geometry job. Run 37216877996 passed
unsigned compilation and all 32 Mac export comparisons, but FP16 Core ML exceeded
the numerical tolerance on the first input. Its incomplete receipt is preserved
under `results/native-macos-37216877996/`. Scene execution was skipped. The prepared
follow-up selected `screening_precision=FLOAT32` and run 37218964987 passed all 32
Core ML comparisons and scene batches. Its exact public receipts are under
`results/native-macos-37218964987/`; see the FP32 verification receipt.
The workflow retains selected JSON receipts for 30 days, excluding images, tensors,
vectors and model binaries. Export/conversion checkpoints belong to exclusive new
directories; unlike the Swift CLI's atomic checkpoints, their writes are not atomic
and interruption can leave an unreadable checkpoint. Final reports remain exclusive.

Swift compilation and FP32 Core ML parity passed. Frozen-label v2 sensitive false
passes were 3/5, so routing quality remains unqualified. Physical iPhone execution
remains unverified. No app runtime reads this encoder or v2 policy. An untouched
grouped holdout, Swift pixel preprocessing parity and locked-device measurements
remain necessary before routing photos. This is evaluation tooling only.
See [the Mac run and follow-up proposal](../../../docs/verification/native-screening-macos-2026-10-04.md).

## Raw scene diagnostics and human backup

The independent pixel audit confirmed `public-12`'s torso/arms regression. Two other
frozen human labels are unsupported (`public-02`, red utensil) or ambiguous
(`public-13`, fabric). Preserve all frozen labels and results. The separate audit
does not create a revised privacy acceptance denominator.

`human_backup.py` restores the original people/hand/face semantic contrast as an
additional abstention on v2 candidates. Frozen v3 replay uses archived observations,
performs no model/detector calls and creates exclusive new receipts. It restored
`public-12` abstention and preserved 11/11 clear meals; frozen sensitive false passes
were 2/5. This is exposed development evidence. Durations inherited from the source
report are mixed component measurements, not v3 execution or end-to-end latency.

```sh
mkdir NEW_V3_DIRECTORY
python -B scripts/eval/local-food/human_backup.py scripts/eval/local-food/results/native-macos-37218964987/v2-manifest.json scripts/eval/local-food/results/native-macos-37218964987/v2-results.json scripts/eval/local-food/results/siglip2-windows-20261004/results.json NEW_V3_DIRECTORY/manifest.json NEW_V3_DIRECTORY/results.json
python -B scripts/eval/local-food/score.py NEW_V3_DIRECTORY/manifest.json NEW_V3_DIRECTORY/results.json NEW_V3_DIRECTORY/summary.json
```

The separate `scene-diagnostics` CLI records actual dimensions/orientation, raw
confidences/rectangles/pose points, result availability and accepted counts. Fixed
profiles are full-body 512px, full-body 1024px and upper-body 512px. Confidence 0.2,
two pose points and maximum four hands remain unchanged. At most 64 observations
per stage and 32 points per observation are retained, with full counts and explicit
truncation flags. Its diagnostic version cannot satisfy v2 routing composition.
No detection does not establish that the scene contains no person.

```sh
swift run --package-path ios LocalFoodEval scripts/eval/local-food/fixtures.siglip2-development-v1.json IMAGE_DIRECTORY NEW_RAW_REPORT scene-diagnostics
python -B scripts/eval/local-food/diagnose_scene.py scripts/eval/local-food/fixtures.siglip2-development-v1.json NEW_RAW_REPORT NEW_DIAGNOSTIC_SUMMARY
```

The prepared manual `ios-compile.yml` target `scene-diagnostics` includes unsigned
app compilation and the reusable diagnostic job. The job uses isolated Python 3.11
and `requirements-diagnostics.txt` for owned control pixels, downloads frozen public
fixtures only, and retains JSON/partial failure receipts for 30 days. No encoder,
image artifacts, paid calls, signing or TestFlight upload are included. Failure
stops after preserving the first partial receipt. Cancellation after 20 seconds per
profile is cooperative; the job has an outer 20-minute timeout. Native compilation
and raw diagnostic execution are pending. See
[the diagnostic audit](../../../docs/verification/scene-diagnostic-audit-2026-10-04.md).

## Fixed upper-body comparison on fresh sources

`fixtures.fresh-challenge-v1.json` freezes thirteen original public-domain/CC0
photos with independent pixel labels before inference. Five foods contain no
visible human, five contain identifiable human regions and three are negatives.
Only three positives are prepared meal/drink servings. The separate label audit
retains an acquired blurry archival frame with uncertain food presence and the
unavailable final source. Neither is forced into the binary scored set. Old32
hashes, source pages and recognizable scenes were excluded. Model pretraining
independence is unknown; after observation this set becomes exposed evidence.

`scene-policy-v4.json` was fixed before the fresh run. `compose_upper.py` compares
unchanged v3/full-body-512 checks with v4's additional upper-body-512 abstention.
1024px observations remain diagnostic only. Complete matching hashes, pinned
semantic artifacts, exact verified native source revision, every detector result
and untruncated raw observations are required. Every output is exclusive. Gate
checks report eligible food recall and confirmed human-food leakage separately;
family counts are separate from case counts. No result qualifies uploads.

```sh
python -B scripts/eval/local-food/compose_upper.py FROZEN_MANIFEST SEMANTIC_REPORT NATIVE_DIAGNOSTIC_REPORT VERIFIED_NATIVE_GIT_SHA NEW_OUTPUT_DIRECTORY
```

Manual `ios-compile.yml` target `scene-diagnostics` now accepts the constrained
`scene_dataset` choice `development-v1` (default) or `fresh-challenge-v1`.
The reusable job rejects other inputs, fetches pinned originals at ten-second
intervals without automatic retries, and retains JSON receipts only. It does not
execute the semantic model or activate a phone build. Until that fresh native run
completes, combined v3/v4 quality remains untested on the new sources.

The local semantic observation pass completed all thirteen inputs. It captured
5/5 no-human foods and 3/3 clear meal/drink positives; none of the three negatives
became candidates. Three of five confirmed human-food scenes were candidates:
carrots/hands, plates/hands/torso and corn/hands/torso. Semantic screening alone
therefore fails the frozen human abstention expectations. Do not call the aggregate
8/10 food recall an acceptance result. Receipts are under
`results/fresh-siglip2-windows-20261005/`; native geometry is pending.

## Acquisition receipts

Public source/licence/author links are recorded in `fixtures.json` (CC0/public domain).
Fetch pinned HTTPS Wikimedia media URLs, bound inputs to 10 MiB, verify hashes before
writing, preserve existing files, and stop on the first error. Redirect destinations
are checked before following them. Do not retry rate limits automatically.

Initial bulk metadata collection was rate-limited; a nonterminating PowerShell loop
reused stale results. That catalog was rejected and preserved in ignored local data.
Only successful records were inspected and frozen. Further bulk API lookup stopped.
The frozen fetcher uses file URLs and does not query/search the Commons API.

Do not add personal photos to this public CI manifest. Private device evaluation
needs a separate local manifest/cache; any upload needs target-specific authority.
