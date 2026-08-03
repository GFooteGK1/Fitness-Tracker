# SociusFit Auto Meal Photos — native harness

This directory contains the minimal native boundary approved in ADR-0005. The
current slice is intentionally **compile-only and upload-disabled**. It proves
that the host app can request full Photos authorization and enable the PhotoKit
background-upload extension. The extension returns `.completed` without
discovering, classifying, downloading, or uploading any asset.

## Generate and build on macOS

The project is generated rather than committed:

```bash
xcodegen generate --spec ios/project.yml --project ios
xcodebuild \
  -project ios/SociusFitAutoMeals.xcodeproj \
  -scheme SociusFitAutoMeals \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
swift test --package-path ios
```

The GitHub workflow pins XcodeGen 2.46.0 and verifies its published SHA-256
before execution. Generated `.xcodeproj`, SwiftPM output, and derived data are
ignored.

## Compile-only automation contract

```yaml
id: ios-native-compile
purpose: Compile the credential-free native app and PhotoKit extension boundary.
trigger: Pull requests changing ios/** or the workflow, plus manual dispatch.
input_sources: Reviewed repository source and pinned XcodeGen release artifact.
scope: ios/** and an ephemeral generated Xcode project on a GitHub macOS runner.
allowed_actions: Read source, verify tool checksum, generate project, compile unsigned code, run pure state tests.
disallowed_actions: Signing, App Store Connect access, TestFlight upload, secret access, production API calls, photo access, deployment.
human_placement: Greg approves the later signing/TestFlight workflow and supplies credentials directly to GitHub secrets.
quality_threshold: Tool checksum passes; Swift tests pass; unsigned app and extension compile; every warning is reviewed, including the expected iOS 27 deprecation of the iOS 26.1 protocol.
retry_budget: One normal GitHub Actions rerun for an infrastructure-only failure.
stop_condition: Any checksum, generation, test, or compile failure.
failure_route: Failing GitHub check with command output; no fallback publication.
receipt: GitHub Actions job result attached to the exact commit.
notification_route: GitHub check status only.
memory_or_state: No persistent runtime state; GitHub retains job metadata and logs.
source_of_truth: Repository workflow plus the exact GitHub Actions run.
representation_policy: No external representation or user communication.
rollback_or_correction_path: Revert the workflow/native scaffold; no runtime or user data exists.
```

## Signing boundary — not configured

Do not commit Apple private keys, certificates, provisioning profiles, issuer
IDs, key IDs, or App Store Connect credentials. Signing requires registered app
and extension identifiers, an App Group, TestFlight configuration, and encrypted
GitHub secrets. Those changes happen only after the unsigned cloud build passes
and Greg approves the exact credential workflow.

Official PhotoKit source:
https://developer.apple.com/documentation/photokit/uploading-asset-resources-in-the-background
