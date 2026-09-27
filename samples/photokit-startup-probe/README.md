# PhotoKit startup-only diagnostic sample

This reduced sample isolates background-upload extension startup. It is derived
from native probe source `dc76f91d63e8696a2873a1adedbcd24b61ff6c66`.
It is separate from the full probe distributed through TestFlight.

## Build evidence and limits

The CI ZIP includes `BUILD-VERIFICATION.json`, file checksums, and the generated
`PhotoUploadProbe.xcodeproj`. The workflow packages it only after unsigned Debug
builds of the host and extension succeed for generic iOS Simulator and iOS
destinations. See the receipt for the exact commit, Xcode version, and run URL.
A source checkout without that receipt does not establish a successful build.

**This reduced sample has not been run on a physical device.** Compilation does
not establish signing, installation, extension scheduling, or reproduction.

## Open and build on a Mac

Use Xcode 26.5 (Swift 6) and an iOS 26.4 or later deployment target.
For the CI ZIP, open `PhotoUploadProbe.xcodeproj` directly; XcodeGen is not needed.
From this folder, verify the package and compile without signing:

```sh
shasum --algorithm 256 --check SHA256SUMS.txt
xcodebuild -project PhotoUploadProbe.xcodeproj -scheme PhotoUploadProbe -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
```

To generate or regenerate the project from source, install XcodeGen 2.46.0:

```sh
xcodegen generate --spec project.yml --project .
```

## Configure a physical-device test

Set your `DEVELOPMENT_TEAM` in `project.yml` and choose two unique bundle IDs.
Replace both `com.example.photouploadprobe` bundle IDs in `project.yml`. Register
one App Group and replace `group.com.example.photouploadprobe` in
`Shared/ProbeState.swift` and both entitlement files. Enable that same App Group
for both App IDs; regenerate the project and use normal development signing.

The extension retains `BackgroundUploadURLBase` through the
`PROBE_UPLOAD_BASE_URL` build setting. Before device testing, replace
`https://example.invalid` with your own developer-controlled HTTPS base URL
configured for PhotoKit. The placeholder is not a valid device-test
configuration. Failure with it does not establish reproduction.

No signing material, credentials, private endpoint, photo, or original device
diagnostic archive is included. This sample creates no upload jobs or network
transfers, but its URL metadata remains configurable for startup eligibility.

## Reproduction procedure and prior observations

The original full probe showed no recorded initializer/process calls on an
iPhone 16 Pro running iOS 26.6.1 with iCloud Photos and Optimize iPhone Storage.
Recurrence in this reduced sample remains unverified.

1. Install this configured sample and open it once.
2. Tap **Allow Photos and Enable** and grant full read/write Photos access.
3. Confirm Full Photos access=Yes, Extension enabled=Yes, and App Group=Available.
4. Leave the app normally, without force-quitting, and take one disposable photo
   using Apple Camera.
5. Leave the phone locked on Wi-Fi and power. Record the actual waiting interval;
   these conditions do not guarantee a scheduling deadline.
6. Reopen and **Refresh Diagnostics**. Preserve the displayed markers and device
   OSLog messages for subsystem `com.example.photouploadprobe`, category `Lifecycle`.

Refresh only reads markers; it cannot launch the extension. Host App Group access
does not prove extension access. Missing markers and zero counters cannot by
themselves establish that the system never attempted launch.

## Deliberate reductions

The extension records initializer/process entry, then `process()` returns
`.completed`. It never fetches image resources, enumerates library changes,
classifies food, or creates an upload job. The full probe's baseline, discovery,
and upload pipeline was removed. Authorization, enablement, the ExtensionKit
entrypoint, PhotoKit protocol, App Group persistence, and OSLog remain.
Removal may change scheduling behavior; a device test is needed before claiming
the original failure is reproduced.

## Compile workflow contract

The existing `iOS Native Compile` workflow accepts the manual `apple-support`
target. It has read-only repository permission, a 20-minute job timeout, pinned
XcodeGen verification, and no signing, TestFlight, deployment, or runtime secret
access. It stops on a failed generation/build/package step and retains the
source ZIP only after both builds succeed. The run and its source commit are the
build evidence; physical-device acceptance is separate. Retry only after
diagnosing a failure, following the repository's bounded-attempt policy.
