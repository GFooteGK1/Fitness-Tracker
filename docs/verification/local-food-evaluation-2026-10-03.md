# Automated local food-screening evaluation candidate

Date: 2026-10-03. Status: approved change committed/pushed, exact-source unsigned
macOS checks and actual inference passed. The v1 screening policy failed the routing
goals on the development references; keep it observation-only. No TestFlight release.

Greg authorized automated evaluations. Candidate work is in
`.worktrees/auto-meal-photos-probe` on `codex/auto-meal-photos-probe`, based on
released build-11 source `a747d57734c6dd8e9f519b482a8fa6d4734817ed`.
The new evaluated source is `eb2265189f9cd23e7a113c9203be8c9a32641409`.
Remote branch readback matched it. Greg's approval covered commit/push and unsigned
checks, including the evaluation; it did not include another TestFlight upload.

## Implemented

- Shared Vision CPU/revision-1 operation between phone and `LocalFoodEval` macOS CLI.
  App permission checks, Photos downloads policy, orientation, discovery/session
  checkpointing, cancellation and read-plus-classification timing remain in place.
- 21 inspected, frozen public development references: 19 food, two cats, 11 clear
  meals, five scenes containing people/body parts. Related shots share groups.
  Reference expectations are not provided to Vision. No personal phone image in CI.
- Bounded, hash-verified fetcher with HTTPS media-host checks before redirects,
  no overwrite or automatic retry. Dataset/image SHA-256 binding and report provenance.
- Deterministic category/split/layer scores. Missing/error/uncertain food stays in
  recall denominators; non-food and sensitive false passes remain visible.
- Unique partial checkpoints after each completed case and immutable final reports.
  CI retains JSON only, including ordinary failure checkpoints. Runner loss/job timeout
  can prevent artifact upload. No upload-quality acceptance or production activation.

## Current checks

- `python -B -m unittest discover -s scripts/eval/local-food -p 'test_*.py' -v`:
  **9 tests passed**. Includes missing/error denominators, provenance/hash failures,
  grouped split leakage, evidence separation, sensitive false passes, fetch boundaries,
  redirect rejection, and interrupted-report CLI scoring/overwrite preservation.
- `python -B scripts/eval/local-food/fetch.py scripts/eval/local-food/fixtures.json scripts/eval/data/local-food`:
  **21 cached image SHA-256 checks passed**. No live classifier run.
- `npm run test:ios-signing`: **8 checks passed**.
- `git diff --check`: passed.
- Independent reviewer inspected shared extraction, runner/grader/fetcher and both
  reference contact sheets. No remaining blocking source finding. Partial checkpoints
  and redirect enforcement were added following review and re-reviewed.
- Windows cannot execute Swift/Vision; the exact-source macOS run supplies that
  evidence below. Beads CLI is unavailable here; canonical tracker status unchanged.

## Exact-source macOS baseline

[Run 37141107325](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/37141107325)
succeeded at `eb2265189f9cd23e7a113c9203be8c9a32641409` on October 3:
53 Swift tests, 8 signing checks, Xcode 26.5 unsigned app/extension compile,
9 evaluation tests, 21 downloaded image-hash checks and actual Vision inference.
The final report is complete with no missing/error cases.

| Observation | Result |
| --- | --- |
| Food passed | 8 / 19 (42%) |
| Clear meals passed | 5 / 11 (45%) |
| Non-food false passes | 0 / 2 (both cats) |
| People/body-part scene passes | 3 / 5 |
| Uncertain | 9 / 21 |
| Errors/missing | 0 / 21 |
| Classifier timing | median 56 ms; nearest-rank p95 91 ms; maximum 680 ms |

Six clear meals were uncertain. The packaged-food shelf and coffee were marked
non-food. Scenes public-02 (hands near pizza), public-12 (meal with person/body)
and public-13 (fruit vendor/body) passed despite the conservative mixed-scene rubric.
Those three are among the eight positive food decisions. A lower food threshold
would not resolve the already observed mixed-scene passes.

Runtime: macOS `Version 26.6.2 (Build 25G83)`, CPU, Vision revision 1,
policy `vision-r1-food-v1`, oriented 512px ImageIO thumbnails. Timing covers the
classifier, not Photos reads, end-to-end capture latency or locked iPhone execution.
This food-heavy development set has grouped related images, two negative cats
and no holdout; its counts are baseline observations, not a population accuracy estimate.
No automatic-upload/privacy or physical-device acceptance is established.

Reports are retained in
`scripts/eval/local-food/results/eb22651-macos-26-6-2/` and the
[CI artifact](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/37141107325/artifacts/11280706518).
They contain public case IDs/results only; no images or private device identifiers.

- Canonical Git manifest SHA-256: `48d96c942ef01ddf066a792c78aa3b7a6541497bbd81870726eff148e6963511`.
- Raw report SHA-256: `9daecda0d01bc5b1e80ce339ea36e961384b760a661eeea18030108d84f2adf1`.
- Summary SHA-256: `ccc15f8578758c9b26510bd7ff8009808ecc66db2aa8d254de727e5d4b900622`.

The raw report's manifest hash matches the exact Git blob. Local regrading against
those bytes equals the downloaded CI summary. Windows working-copy CRLF bytes had
a different hash (`1f5d65b...`); do not substitute that working-copy hash for this
canonical receipt. Independent result audit confirmed counts, hashes and limits.

## Next

Keep v1 observation-only. Compare an improved or replacement image-capable local
screening approach against this frozen baseline. Expand representative negatives,
packaged-food and screen/document challenges, and create an independently adjudicated
grouped holdout before quality acceptance. Keep locked iPhone tests separate.

Then prepare the authenticated Socius macro-analysis path into review drafts, with
duplicate prevention/recovery and explicit acceptance. Jev may judge text observations
later. Privacy, upload and meal-persistence implementation remain separate approved slices.

Prior untracked support/error/plan files and build-11 receipt are preserved. Generated
collection catalogs and image caches remain ignored. A rejected rate-limited metadata
catalog was preserved; only successful pixel-inspected records entered the manifest.
