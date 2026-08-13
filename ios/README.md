# SociusFit Auto Meal Photos — native harness

This directory contains the minimal native boundary approved in ADR-0005. The
current slice is a fail-closed physical-device protocol probe. With the
committed `https://example.invalid` configuration, it cannot upload a photo.
After a separate approval supplies a private HTTPS test endpoint, the extension
baselines PhotoKit persistent changes and registers at most one newly inserted
original photo resource per invocation. Use disposable test photos only.

The harness requires iOS 26.4 because the upload-job creation and response
header APIs used by this probe became available in that release. Greg's iPhone
16 Pro on iOS 26.6 satisfies this minimum.


The probe does not classify food, store photo bytes, analyze nutrition, create a
canonical meal, or call `/api/meals/upload`. Its token stays in the extension's
private defaults for this bounded test. App Group state belongs to the later
product implementation.

## OPTIONS 501 protocol probe

The standalone Node server implements only Apple's documented non-resumable
path:

- `OPTIONS /probe/photo` returns `501` with no `Upload-Limit`;
- `POST /probe/photo` discards the request body and returns `201`;
- receipts contain only protocol header fields, byte count, path, status, and a
  random request ID;
- the CLI binds to `127.0.0.1`, so it does not expose an endpoint.

```bash
npm run test:ios-probe
npm run probe:ios-upload
```

The loopback CLI proves the HTTP contract only. A physical iPhone requires a
separately approved private TLS endpoint with the same behavior.

After signing and that endpoint are approved, run this canary:

1. Record the source commit, iPhone model, iOS version, install type, network,
   and iCloud Photos state.
2. Install the internal TestFlight build and start with the extension disabled.
   iOS 26.6 uses normal PhotoKit scheduling; Resource Upload Test Mode requires
   iOS 27 plus an Xcode-run development-signed build and does not apply here.
3. Grant full read-write Photos access and enable the extension once.
4. Wait for the `ProtocolProbe` baseline log before taking a disposable photo.
5. Close or lock the host, take one photo, and record scheduling latency.
6. Capture the exact `OPTIONS` receipt, any `POST` receipt, and the final
   PhotoKit job state plus `x-probe-request-id`.
7. Disable the extension and prove that another disposable photo creates no
   server receipt.

Do not add HTTP `104` support yet. It is required only if the physical-device
`501` canary proves that PhotoKit rejects or cannot complete a non-resumable
upload. Stop and request approval before selecting or exposing a raw gateway.

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
npm run test:ios-signing
```

The GitHub workflow pins XcodeGen 2.46.0 and verifies its published SHA-256
before execution. Generated `.xcodeproj`, SwiftPM output, and derived data are
ignored.

## Cloud compile evidence

Draft PR #66 proved the credential-free boundary on source commit `d9e9105`:

- all five deterministic Swift tests passed;
- XcodeGen 2.46.0 generated the project after its release SHA-256 passed;
- Xcode 26.5 compiled the unsigned host app and ExtensionKit target for a
  generic iOS Simulator;
- no signing, secret, App Store Connect, TestFlight, photo, or production API
  access occurred.

The current probe compile run `31637024156` passed all 10 Swift tests, pinned
XcodeGen generation, and the unsigned app plus extension compile on Xcode 26.5
at source commit `6453f20`. That run did not test signing, archiving, export, or
App Store Connect upload.

Two first-run failures were corrected in scope: mutating ledger operations now
execute before Swift Testing `#expect` assertions, and the workflow uses the
archive's verified `xcodegen/bin/xcodegen` path.

## Compile-only automation contract

```yaml
id: ios-native-compile
purpose: Compile the credential-free native app and PhotoKit extension boundary.
trigger: Pull requests changing ios/** or the workflow, plus manual dispatch.
input_sources: Reviewed repository source and pinned XcodeGen release artifact.
scope: ios/** and an ephemeral generated Xcode project on a GitHub macOS runner.
allowed_actions: Read source, verify tool checksum, generate project, compile unsigned code, run pure state tests.
disallowed_actions: Signing, App Store Connect access, TestFlight upload, secret access, production API calls, photo access, deployment.
human_placement: This workflow remains credential-free; the separate TestFlight environment owns any later signing approval and secrets.
quality_threshold: Tool checksum passes; Swift tests pass; unsigned app and extension compile; every warning is reviewed, including the expected iOS 27 deprecation of the iOS 26.4 protocol.
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

## Manual TestFlight workflow — prepared, not dispatched

`.github/workflows/ios-testflight.yml` is a manual-only internal probe upload.
It accepts only `codex/auto-meal-photos-probe` plus the exact confirmation text,
uses read-only repository permission, and waits on the protected `TestFlight`
GitHub environment. It runs the credential-free checks before decoding secrets,
validates an Apple Distribution identity and separate host/extension App Store
Connect profiles, signs through an ephemeral keychain, verifies the embedded
probe URL, exports one IPA, validates it, uploads it with a team App Store
Connect API key, and removes signing material in an unconditional cleanup step.
No IPA or signing artifact is retained as a GitHub artifact.

The committed endpoint remains `https://example.invalid`. A private HTTPS base
URL can be injected only through the `PROBE_UPLOAD_BASE_URL` environment secret.
The workflow rejects `example.invalid`, `/api/meals/upload`, URL credentials,
queries, and fragments. The value is embedded in the signed extension and must
be a short-lived capability URL, not a durable authentication boundary.

The GitHub `TestFlight` environment exists with `GFooteGK1` as required reviewer
and a branch policy limited to `codex/auto-meal-photos-probe`. It currently has
no variables or secrets. The workflow has not been dispatched.

Follow `ios/APPLE-PORTAL-CHECKLIST.md` for the exact identifiers, profile names,
team API key, secure GitHub values, internal tester group, and revocation steps.

Do not commit Apple private keys, certificates, provisioning profiles, issuer
IDs, key IDs, endpoint capability URLs, or App Store Connect credentials. Do not
create an App Group for this minimal canary unless Apple proves a managed
capability or entitlement requires one. The later product path still expects
shared App Group state.

Official PhotoKit source:
https://developer.apple.com/documentation/photokit/uploading-asset-resources-in-the-background
