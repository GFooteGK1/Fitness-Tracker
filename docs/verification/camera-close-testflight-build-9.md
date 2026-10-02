# Camera Shortcut TestFlight build 9

Date: 2026-10-01. Status: signed upload successful; Greg reports installation and successful unlocked and locked native thumbnail checks.

Greg explicitly authorized uploading the new Camera Shortcut build to TestFlight. Existing TestFlight environment approval was completed through the signed-in GFooteGK1 GitHub account for this run only. No signing credentials, portal identities or access controls were changed.

- Source: `5c263322413dc43c87604e306d83db5cfbd65e2c`, branch `codex/auto-meal-photos-probe`.
- Variant: `native`, not the reduced Apple support sample.
- App: `com.sociusfit.automeals`; App Store Connect record `6800921777`.
- Version/build: `0.1.0 (9)`; workflow run number sets the archive build number.
- Unsigned compile: [36927307186](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/36927307186), success at the same source SHA.
- Signed upload: [36932854584](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/36932854584), completed successfully.
- 32 Swift core tests passed. Credential-free checks, profile/signing validation, signed archive/export, Apple validation/upload and signing-material cleanup succeeded.
- Apple upload log: `UPLOAD SUCCEEDED with no errors` at `2026-10-01T22:10:07Z`.
- Delivery UUID: `3c55bf4e-faec-4f47-837f-8573821c8db3`.

App Store Connect initially displayed the existing Physical Device Probe group with one tester and five older builds, including build 8. Navigating to refreshed build data redirected to Apple sign-in because the browser session expired. The user was asked to sign in through the existing browser tab. Upload succeeded independently through the configured CI API key.

Greg subsequently reported adding the existing testing group, updating the installed app, and successful native action execution. This is user-reported device evidence; Apple processing and assignment were not independently read back after browser sign-in expired.

The new native action returned `Completed local thumbnail check` once unlocked and once while the phone remained locked. These two smoke tests establish execution and a small local thumbnail read in those trials. They do not establish full-resolution access, the identity of the newly captured image, ten-repeat qualification, discovery, classification, upload, or macro analysis. Before/after reboot and permission-failure device checks remain pending.

Group: https://appstoreconnect.apple.com/teams/92026fd0-1db3-4d17-9b89-1420d6cb58e9/apps/6800921777/testflight/groups/6bfb954f-7f90-4be1-9c64-715f22766817/builds

After installation, follow `camera-close-slice-1.md`: use the Camera Shortcut tab, explicitly grant Full Photos access, disable the separately retained PhotoKit extension if enabled, then invoke Check Camera Photo Access from Camera Is Closed / Run Immediately. Verify the current run timestamps unlocked, then from Lock Screen without unlocking during execution. Build 9 is a local-thumbnail diagnostic; food classification, ingestion and macro analysis remain unimplemented.

Beads remains unavailable in this session. No issue completion or physical-device acceptance is claimed. This release receipt is local and does not change the source archive.
