# Camera-close slice 3: local food-screening candidate

Date: 2026-10-03. Status: local source candidate; not compiled or installed. Build 10 discovery tests passed according to Greg. This is an observation experiment, not a completed automatic meal-logging feature.

## Source and scope

`ios/App/ScreenNewPhotosIntent.swift`: **Discover and Screen New Photos**, reusing persistent discovery. `ios/Shared/LocalFoodScreening.swift`: versioned experimental decisions, opt-in, durable results, bounded retries and evaluation counts. `ios/App/FoodScreeningProbeView.swift`: enable/disable, local previews, reasons/scores/timing and human food/suitability/split labels. Original actions remain available. See ADR-0007.

No upload, provider/Jev request, server change, Photos download, macro estimate or meal creation. Resized images remain transient. Disable the separate background extension independently before asserting local-only behavior.

## Verification

- Eleven new Swift tests authored: malformed/unsupported observations, sensitive-scene abstention, ambiguous evidence, opt-in, batching/restart/deduplication, retries, uncertain persistence, interruption/labels, concurrent writers, invalid/future/oversized state, and evaluation denominators.
- Swift/Xcode unavailable in Windows (`swift` not recognised): new tests, native compilation, UI rendering and physical classification have not run. Build 10's 42 tests do not validate this candidate.
- Independent review identified soft runtime budgeting and exclusion of interrupted recall misses. Corrected descriptions and shared evaluation counts; timeout no longer captures `PHImageManager`. Current compute-stage APIs replace the deprecated CPU flag. Exact Apple declarations were read.
- Greg approved committing/pushing this slice, macOS CI and TestFlight upload after checks pass on October 3. Compile the exact SHA with the existing native workflow before signing. Preserve profiles/groups. Beads unavailable (`bd` not recognised); no issue claim/completion asserted. Current verification remains pending.

## Physical smoke test after verified release

1. Install the new build, preserve discovery state, verify Full Photos access and disable the separate extension.
2. Camera Shortcut -> Set Up and Review Local Food Screening -> Enable Local Food Screening. This includes already discovered photos since enrollment: account for catch-up using disposable test images.
3. Replace Discover New Photos in Camera Is Closed / Run Immediately with **Discover and Screen New Photos**; keep text result -> Show Notification.
4. Close Camera with no new captures until pending reaches zero (up to three checks/run). Completed results must not repeat.
5. Separately capture a clear meal, non-food object and mixed/ambiguous scene. Inspect each local preview/identity, outcome, reason, attempts and elapsed time. Record expected truth separately; wrong classifications are learning results. No macros expected.
6. Capture five stills in one session. Subsequent closes must account for all five without duplicate classification. Compare an independent capture log. Videos excluded; Live Photos use still images.
7. Repeat meal/non-food captures from Lock Screen without unlocking before execution. Verify saved classification, not just notification. Record OS/build and total Shortcut time including failures. CPU support and locked Vision remain hypotheses until observed.
8. Exercise overlapping triggers, revoked/limited permission, unavailable/iCloud-only pixels, deletion, restart and reboot before/after first unlock. Errors stay visible, no download or conversion to non-food. Three failed/interrupted attempts exhaust retries. Preserve evidence.
9. Disable after a completed run: another Camera close must return enable-required with no screening attempts. Control/label changes during execution reject visibly. Re-enable retains results.

## Dataset qualification after smoke proof

Prepare about 100 varied disposable local images: meals, drinks, packaged food, mixed scenes, pets, people, documents, photographed food screens, actual screenshots, empty dishes and low light. Pre-record truth, macro suitability, sensitive-challenge membership and development/held-out split in an independent local capture log. Group bursts/near-duplicates together. Test imports count as new additions after enrollment.

Transfer expected labels into local records without changing truth to match output. Counters alone are not proof of blind labels or a correct split. Tune only development cases; freeze a versioned policy before a separate held-out evaluation. Report exact denominators, pending/error misses, recall, broader/sensitive non-food false passes, uncertain rates, latency, memory/battery observations and OS/build.

Proposed gate: at least 95% clear-meal recall, zero observed sensitive-challenge false passes and measured broader false passes. Implementation and deterministic tests do not achieve it. A classifier cannot ensure literal zero leakage; explicit image approval remains required before upload unless Greg accepts a different policy. Remote intake and Socius review drafts are later slices.
