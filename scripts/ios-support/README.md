# Reduced PhotoKit sample distribution

`samples/photokit-startup-probe` is the portable Apple source sample. Its compiled
source ZIP is independent of the internal TestFlight packaging described here.

`prepare-testflight-sample.py DESTINATION` stages a fresh, allowlisted tree. It
copies the sample's host and extension verbatim and changes exactly one App Group
literal in `ProbeState.swift` to `group.com.sociusfit.automeals`. The native
`ios/project.yml` supplies existing distribution identifiers, per-target signing,
the App Store icon, export-compliance metadata, and a fail-closed endpoint setting.
The host display name and Photos permission description identify the reduced
sample. Host Info.plist metadata records the variant and source commit.

The helper does not read credentials, change either source tree, create Apple
identifiers, or configure an endpoint. It refuses an existing destination and
fails when expected configuration anchors change. It includes none of the native
discovery/upload runtime. The only shared Swift file is the reduced `ProbeState`.

## Release contract

The manual `apple-support-release` target in `iOS Native Compile` generates this
same staged project and builds Release for generic iOS Simulator and iOS without
signing, secrets, upload, or installation. Its timeout is 20 minutes.

After exact-commit compile success and user release authorization, dispatch the
existing `iOS TestFlight Probe` with `source=apple-support` and the existing
`UPLOAD TESTFLIGHT PROBE` confirmation. `native` remains the default. The existing
branch restriction, protected TestFlight reviewer environment, scoped secrets,
profile/endpoint checks, signed archive checks, upload, and unconditional cleanup
remain in force. The actual build number comes from the workflow run number.
The signed host's variant and source SHA must match before export. Signing assets
and the generated distribution tree remain ephemeral; no IPA is retained.

The receipt is the exact-SHA compile result, signed upload result, and Apple
processing/internal-group readback. Retry only after diagnosing failure within
the repository's bounded-attempt policy. Uncertain upload outcomes must be
reconciled with Apple before another upload. This workflow sends no support reply
and does not authorize production ingestion or additional Apple configuration.

## Device observation

The existing app identity means installation is an in-place update of the full
probe. Capture existing diagnostics before updating; do not uninstall, reset
permissions, or clear the App Group. Native saved diagnostics use different keys
and files from the reduced sample's `initialized` and `calls` keys. Those values
may also persist across future sample updates, so record their initial values.

Open the sample, perform its single initial **Allow Photos and Enable** action,
and capture the resulting authorization, extension-enabled, App Group, initializer,
and process-count baseline. The button deliberately toggles enablement once.
Leave normally without force-quitting, take one disposable Camera photo, record
its time, and preserve the enabled state through one recorded overnight period
on power/Wi-Fi. Refresh once and capture the result. Do not repeat the setup
toggle during that observation window. These conditions promise no scheduling
deadline, and absent shared markers do not rule out an attempted launch.

The reduced sample creates no new upload jobs, reads no image resources, and
makes no network calls. Updating the app does not establish that the OS has no
previously queued jobs. Do not claim zero possible device transfers from this
source inspection alone. Do not delete old jobs or data to manufacture a result.

Passing compile, signing, or TestFlight availability does not prove physical
extension startup, processing, reproduction, or upload behavior.
