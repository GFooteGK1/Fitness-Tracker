# Camera-close discovery TestFlight build 10

Date: 2026-10-01 America/Chicago; upload completed October 2 UTC.
Status updated October 3: source verification and upload succeeded; screenshots confirm installed 0.1.0 (10). Greg reports controlled discovery passed after changing the Shortcut action. Broader qualification remains open.

Greg explicitly authorized pushing the reviewed discovery slice and uploading the next TestFlight build after verification. Only that run's existing TestFlight environment approval was completed. No signing credentials, portal access or testing groups were changed.

- Source: `4dd4d745fc381d485066ad875c81a3be02f42efe`, branch `codex/auto-meal-photos-probe`.
- Commits: `d1aa680` implements discovery; `4dd4d74` corrects throwing test-macro expressions and trailing whitespace.
- Variant: native host plus retained diagnostic extension, app `com.sociusfit.automeals`, App Store Connect app `6800921777`.
- Build: 10, confirmed by archive `CURRENT_PROJECT_VERSION=10`.
- [Unsigned verification](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/36953583439): 42 Swift tests, eight signing checks, generated project, host/extension compile succeeded at the exact source SHA.
- [Signed release](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/36953794600): 42 Swift tests repeated successfully, signing validation, archive, export, Apple validation/upload and ephemeral signing cleanup succeeded at the same SHA.
- Apple log: `UPLOAD SUCCEEDED with no errors`, `2026-10-02T02:07:43Z`.
- Delivery UUID: `c9f75a9d-b19e-45f1-b087-db522adf2f7f`.

First verification run `36953473505` failed compiling test assertions that omitted an inner `try` inside `#require`. Shared production code compiled. The next commit corrected all five reported expressions; the subsequent exact-source test and compile succeeded. No blind workflow retry was used.

Independent source review corrected delete/restore ordering and found no remaining blocking source issue. Compilation verifies source/API compatibility, not locked Photos history availability or device discovery accuracy. Slice 1 has only Greg's one unlocked and one locked thumbnail success, not full qualification.

Once Apple finishes processing, install build 10. If unavailable, check its assignment to the existing Physical Device Probe group; do not create another group or repeat the upload. In Camera Shortcut, grant Full Photos access, disable the separate PhotoKit extension for a local-only trial, then tap Start New Photo Tracking before capturing images. Replace Check Camera Photo Access in the existing Camera Is Closed / Run Immediately automation with Discover New Photos; keep its text result connected to Show Notification.

Test Camera close with zero shots, one shot, and five shots, then repeat without new captures. Expect new-photo counts of zero, one, five and zero after any unresolved candidates finish. Repeat while locked. Record any unresolved count and preserve tracking state; do not reset it. Detailed boundaries and checks are in `camera-close-slice-2.md`.

Discovery retains metadata/identities locally, with atomic checkpoint and candidates, restart retries and bounded capacity. It does not read image bytes, classify food, upload candidates, estimate macros or create meals. Large library changes, delayed metadata, expiry recovery, deletion/restoration and locked discovery still require device qualification.

## October 3 device acceptance

Screenshots confirm build 10 and enrollment at 08:43. Initially they show a completed thumbnail check at 08:44 with discovery not scanned. Greg changed Check Camera Photo Access to Discover New Photos. First scan found seven new photos, zero unresolved, consistent with catch-up since enrollment during earlier tests. Greg then reported zero/one-shot tests passed, followed by all requested tests: five shots, repeat prevention and locked execution.

This is user-reported acceptance on one iPhone. Final per-trial screenshots/counts, exact OS, history recovery, capacity, deletion/restoration, delayed/iCloud resources and reboot qualification were not independently observed. Build 10 contains no food screening, upload or macro analysis.

Beads remains unavailable; no epic completion claimed. This receipt was created after upload and is not part of the source archive.
