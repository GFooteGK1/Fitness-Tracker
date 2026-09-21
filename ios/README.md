# SociusFit Auto Meal Photos — native harness

This directory contains the minimal native boundary approved in ADR-0005. The
current slice is a local, uncompiled September 21 diagnostic candidate on top of
Build 6. It preserves the fail-closed physical-device protocol probe. With
the committed `https://example.invalid` configuration, it cannot upload a
photo. The protected TestFlight workflow may inject only the separately approved
private probe URL. The host records the current PhotoKit change token before it
enables the extension, and the extension registers at most one newly inserted
original photo resource per invocation. Use disposable test photos only.

The harness requires iOS 26.4 because the upload-job creation and response
header APIs used by this probe became available in that release. Greg's iPhone
16 Pro was reported on iOS 26.6.1 on September 21; verify the installed version
again for the next device experiment.


The probe does not classify food, store photo bytes, analyze nutrition, create a
canonical meal, or call `/api/meals/upload`. The probe uses only
`group.com.sociusfit.automeals` to share the PhotoKit baseline and a bounded
latest diagnostic snapshot plus three extension-owned lifecycle files. The shared state excludes filenames, asset
identifiers, location, photo bytes, endpoint URLs, and nutrition data.

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

The next device experiment is **one preserved canary**, after exact-candidate
native compilation and separate TestFlight upload authority. The upload workflow
signs, exports, and uploads in one protected job; it is not a build-only check.
Use the actual workflow build number, never an assumed next number.

1. Before an in-place upgrade, screenshot existing diagnostics and record the
   installed build, local/UTC time, iOS, Photos permission, extension state,
   charging/network conditions, and iCloud state. Do not uninstall or reset permissions.
2. On first open, verify the new build and capture snapshot read status and all
   lifecycle slots. Opening/refreshing must preserve state. New slots may be missing.
3. Capture evidence before **Prepare Fresh Canary**, **Allow Photos and Enable**,
   or disable. Both enable/setup actions replace the baseline and run snapshot;
   disable changes the phase. None clears lifecycle files.
4. Prepare exactly one baseline. Confirm Ready for capture, a recorded baseline,
   and the canary time. Historical lifecycle observations remain visible.
5. Leave the app normally (do not force quit), take one disposable photo in ordinary
   Apple Camera, and record its time. This probe has no food filter.
6. Preserve that baseline overnight on Wi-Fi/charging, locked after first unlock.
   Record actual start/end and intervening opens. These are controlled conditions,
   not a guaranteed PhotoKit scheduling deadline.
7. Refresh once and screenshot all statuses, event versions/builds/times, run
   counters, job state, and any existing receipt before changing state again.
8. Interpret affirmative initialization, processing, job registration, and upload
   separately. Missing/invalid evidence does not prove no execution. If unresolved,
   preserve the packet and obtain a fresh diagnostic tied to this window; do not
   repeat unchanged overnight experiments.

The local execution plan at
`docs/plans/2026-09-21-photo-probe-diagnostic-build.md` contains the full
interpretation table and release gates. Effective directory and
replacement-file protection after first unlock still requires device-capable
inspection; Windows tests and simulator compilation do not establish it.

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

## Historical cloud compile evidence

Draft PR #66 proved the credential-free boundary on source commit `d9e9105`:

- all five deterministic Swift tests passed;
- XcodeGen 2.46.0 generated the project after its release SHA-256 passed;
- Xcode 26.5 compiled the unsigned host app and ExtensionKit target for a
  generic iOS Simulator;
- no signing, secret, App Store Connect, TestFlight, photo, or production API
  access occurred.

The earlier probe compile run `31637024156` passed all 10 Swift tests, pinned
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

## Manual TestFlight upload workflow

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

The GitHub `TestFlight` environment uses `GFooteGK1` as required reviewer
and limits deployment to `codex/auto-meal-photos-probe`. Build 3 proved this
protected signing and upload path. Build 6 later passed this path at
`dc76f91d63e8696a2873a1adedbcd24b61ff6c66` (run `34350718417`).
Those historical results do not validate this candidate. Recheck live release
state, profiles, protected environment, and queued runs before any authorized dispatch.

Follow `ios/APPLE-PORTAL-CHECKLIST.md` for the exact identifiers, profile names,
team API key, secure GitHub values, internal tester group, and revocation steps.

Do not commit Apple private keys, certificates, provisioning profiles, issuer
IDs, key IDs, endpoint capability URLs, or App Store Connect credentials. Do not
add another App Group or shared container. The probe is limited to
`group.com.sociusfit.automeals` and the local storage defined by ADR-0006.

Official PhotoKit source:
https://developer.apple.com/documentation/photokit/uploading-asset-resources-in-the-background

## September 21 diagnostic candidate

The initializer logs before App Group/defaults access, then attempts an independent
initialization file. Process entry and termination have separate fixed slots.
The termination flag is set under its existing lock before any diagnostic I/O.
The files contain only schema, allowlisted event, UTC time, bounded sanitized
marketing version and build. Each atomic replacement is at most 2 KiB (6 KiB of
final records across three slots), with iOS protection until first authentication.
No retries, history, network heartbeat, or host-side lifecycle writes are added.

The three files are latest observations from potentially different instances,
not a global timeline or exact invocation count. They share the App Group failure
boundary with UserDefaults. Their absence cannot rule out startup. Host App Group
access does not establish extension access. OSLog cannot observe failure before
the initializer body.

Snapshot reads distinguish valid data, missing observable value, wrong stored
type, corrupt payload, unsupported schema, and unavailable store. Only valid
snapshots display counters. Ordinary observational writes preserve invalid or
future values, report a fixed skipped category, and cannot throw into PhotoKit
control flow. Only explicit canary preparation replaces that snapshot and token.
The additive optional canary date keeps schema 1 and Build 5/6 decoding intact;
legacy snapshots have unknown canary provenance. UserDefaults supplies no durable
write acknowledgement. No synchronize-based durability claim is made.

Older-build and pre-canary lifecycle records are labeled historical. Clock changes
and separate slots prevent strict ordering or same-invocation inference. Snapshot
zero does not prove no launch, initialization does not prove process entry, and
process entry does not prove upload success. The existing token, asset selection,
job acknowledgment, upload, protocol, and entitlement policies are unchanged.

Windows local checks: HTTP probe **3/3** and signing contracts **8/8** passed on
September 21. Swift tests are authored but not executed here: Swift, XcodeGen,
and Xcode are unavailable. Native compile, SwiftUI rendering, physical startup,
locked-device file access/protection, and upload remain unverified for this diff.
The credential-free **iOS Native Compile** workflow must pass on the exact future
candidate SHA before a separately authorized TestFlight release. Build 6's prior
16 passing Swift tests and compile are historical evidence only.
