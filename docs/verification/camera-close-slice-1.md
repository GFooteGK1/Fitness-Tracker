# Camera-close slice 1: implementation and device qualification

Status: local source implemented; Swift compilation, test execution and physical-device qualification pending.

## Implemented

`Check Camera Photo Access` is a host App Intent with locked invocation allowed and no foreground-app request. It reads a 64-by-64 target thumbnail of the most recent still photo, with PhotoKit network access disabled. A ten-second deadline resolves once and cancels a still-pending request. It returns a text result for optional Show Notification use.

The core runner serializes overlapping calls in the host process. Entry, thumbnail read and completion are persisted atomically as one latest run record. Evidence is capped at 2 KiB, app-private, protected until first unlock after reboot, and contains only run UUID, build, phase and timestamps. Invalid or unreadable evidence is not overwritten. No inference, asset ID, photo bytes, filename, location or upload is added.

This latest-photo diagnostic intentionally is not slice 2: it has no enrollment baseline, discovery checkpoint or batch ledger. A no-capture Camera session may read the same photo again. A completed thumbnail read does not prove new-photo discovery, full-resolution access, food detection or nutrition analysis.

The new Camera Shortcut tab exposes Photos authorization without enabling the legacy PhotoKit extension. The PhotoKit diagnostic tab retains its existing behavior. The standalone Apple support sample is unchanged.

## Checks and limitations

- Focused Swift tests cover missing evidence, completion, non-success outcomes, invalid evidence preservation and overlapping calls. They must run with `swift test --package-path ios` on a Swift 6 host.
- Existing Xcode compile workflow includes App/Shared/Tests by directory. New files need no explicit target membership edit.
- This Windows session has no `swift` or `swiftc`. WSL inventory returned `Wsl/EnumerateDistros/Service/E_ACCESSDENIED`. No compilation or Swift test execution is claimed.
- Xcode compile and App Intents metadata extraction must pass before device installation. Existing unsigned CI commands are in `.github/workflows/ios-compile.yml`.
- Existing signing-contract checks passed: `node --test scripts/ios-signing/workflow.node-test.mjs` (8/8). Tracked diff whitespace check passed. These do not establish Swift correctness.
- Independent source review found mutable static properties incompatible with Swift 6 concurrency; fixed with computed getters. Re-review found no remaining blocking source finding. Added a complete future-schema fixture to isolate version rejection.
- Beads command is unavailable. No task was created or claimed. Previous board planning event remains queued after schema rejection; do not flush unrelated events or replace its identity.
- No commit, push, CI dispatch, signing, installation or production changes are implied by the local implementation.

## Device test after a compiled build is available

1. Open the feature companion, not the startup-only Apple support sample. In its PhotoKit Probe tab, disable the old extension if it is enabled, using the existing control after preserving its evidence.
2. Open Camera Shortcut and grant Full Photos access. Note app version/build. Do not use the old Allow Photos and Enable action for this test.
3. In Shortcuts Automation: Camera, Is Closed, Run Immediately. Add this app's `Check Camera Photo Access` action. Optionally pass its text result to Show Notification. This action itself produces no photo preview.
4. Take one distinct disposable still photo and leave Camera. Refresh Shortcut Diagnostics afterward and record run, entry, thumbnail-read and completion timestamps.
5. Repeat ten times unlocked and ten times using Camera from Lock Screen without unlocking during action execution. Record which case was used externally; the diagnostic does not claim it can observe device lock state.
6. Test no capture, denied/limited access, an empty library on a designated test device if available, and unavailable local resources. Do not delete personal photos to create a test fixture.
7. After reboot, test before first unlock, then after first unlock and relocking. Before-first-unlock storage failure is expected; do not mistake missing evidence for proof that the intent never entered.
8. Confirm no server request from this action and no new meal. Correlate failed runs with tied device logs if saved evidence is unavailable; do not reset state blindly.

Gate: the action must be discoverable, record matching entry/read/completion for the tested build and complete without unlocking in the required locked case. If it requires unlock, stop downstream integration and revise the handoff. Only then implement slice 2 durable discovery.
