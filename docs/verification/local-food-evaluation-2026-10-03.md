# Automated local food-screening evaluation candidate

Date: 2026-10-03. Status: reviewed local implementation. Greg approved committing,
pushing and running unsigned macOS checks. Native execution results are pending;
no new TestFlight release is included in this approval.

Greg authorized automated evaluations. Candidate work is in
`.worktrees/auto-meal-photos-probe` on `codex/auto-meal-photos-probe`, based on
released build-11 source `a747d57734c6dd8e9f519b482a8fa6d4734817ed`.
That historical release's 53 Swift tests do not validate these uncommitted changes.

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
- Swift/Xcode and Beads CLI are unavailable on Windows. No Swift tests, compilation
  or actual Vision inference ran for this candidate. Canonical tracker status unchanged.

## Next

With explicit commit/push authority, publish only this slice to the existing branch
and run `ios-compile.yml` with `target=native`. Verify the exact source SHA, Swift tests,
unsigned app/extension compile and actual Vision report artifacts. Inspect failures
before changing thresholds. The first set is development-only and food-heavy; expand
representative negatives/packaged-food cases and create an independently adjudicated
grouped holdout before quality acceptance. Keep locked iPhone tests separate.

Then prepare the authenticated Socius macro-analysis path into review drafts, with
duplicate prevention/recovery and explicit acceptance. Jev may judge text observations
later. Privacy, upload and meal-persistence implementation remain separate approved slices.

Prior untracked support/error/plan files and build-11 receipt are preserved. Generated
collection catalogs and image caches remain ignored. A rejected rate-limited metadata
catalog was preserved; only successful pixel-inspected records entered the manifest.
