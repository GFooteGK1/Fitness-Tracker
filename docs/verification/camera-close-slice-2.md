# Camera-close discovery candidate

Date: 2026-10-01. Status: local implementation; Swift compilation and physical-device tests pending. This code is not in TestFlight build 9.

Greg reported one successful unlocked and one successful locked native thumbnail check in build 9. Development continues into discovery while broader slice-1 qualification remains open. No connected automatic ingestion is enabled.

`Discover New Photos` fetches persistent Photos changes from an explicit enrollment checkpoint. It retains newly inserted asset identities in an app-private bounded ledger, resolves image/video metadata, and returns counts. Existing photos are not backfilled. Imports count; videos are retained as other media. Live Photos count as images. No image resource, location or filename is read by this action, and nothing is uploaded or analyzed.

Checkpoint and unresolved candidates are saved in one atomic snapshot before metadata resolution. A resolution failure preserves candidates for the next scan. Replays do not re-count resolved identities. The actor serializes calls inside the host process. Cross-process writers are not supported. The ledger retains at most 1,000 asset identities, including skipped/deleted entries; capacity exhaustion stops discovery without advancing its checkpoint. This is a bounded pilot, not a permanent queue-management policy.

Expired or unavailable history is surfaced without resetting the ledger. Corrupt, future-schema and oversized records are preserved. Temporarily missing metadata remains unresolved. Explicit deletions retire candidates; later insertions/updates revive retained deleted candidates without re-counting a previously counted photo. Changes are consumed in history order, preserving every insertion with its final deletion state. A history batch with more than 1,000 distinct changed identities fails visibly before saving. Trash restoration, hidden-library filtering and library rebuild recovery still need device qualification. Photos history does not prove an addition came from Camera.

Added ten Swift core tests cover empty enrollment and reset rejection, multiple stills/video/replay, restart after resolution failure, delayed availability, history/capacity failure, deletion/restoration, concurrent invocations, failed completion save and invalid-state preservation. They must run in macOS CI; Windows has no Swift toolchain. Eight signing-workflow contract checks passed, as did whitespace checks. These checks do not compile or execute Swift. Independent source review found the deletion/restoration bug; it was corrected with regression coverage and re-reviewed before handoff.

## Device test after a compiled build is installed

1. Grant Full Photos access and disable the separate PhotoKit extension for a local-only trial. In Camera Shortcut, tap Start New Photo Tracking before taking test images.
2. Replace the automation's thumbnail-check action with Discover New Photos. Send its text result to Show Notification. Keep Camera Is Closed / Run Immediately.
3. Open and leave Camera without taking a photo. Expect zero new photos and no change in total photos tracked.
4. Take one still, then five stills in one Camera session. Expect increments of one and five, with every addition accounted for as resolved or unresolved. Let unresolved candidates retry; do not reset the ledger.
5. Close/reopen rapidly without more captures. Expect zero newly resolved photos after earlier candidates finish. Repeat from Lock Screen without unlocking during execution.
6. Capture a video. Expect no photo increment. Relaunch the companion and verify retained totals/checkpoint. Record actual device/build, exact counts and any failure.

Pending native checks include Photos history API compilation, overlap/restart execution on device, permissions, explicit deletion, delayed/iCloud library metadata, protection before first unlock and history-expiry recovery. Food screening is the following slice. Build/release authorization and a successful compile are required before distributing this candidate.

Independent review: corrected source has no remaining blocking finding. The history bound also includes updates/deletions of pre-enrollment assets; large unrelated library changes can stop this pilot visibly before its retained-candidate limit. Swift execution and locked-device discovery remain unverified.
