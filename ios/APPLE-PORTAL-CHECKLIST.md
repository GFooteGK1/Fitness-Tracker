# Apple portal checklist for the physical-device probe

Use this checklist only for bead `Fitness-Tracker-1vo.1`. The identifiers and
credentials below authorize an internal TestFlight probe. They do not authorize
an App Store release, production ingestion, or a public upload endpoint.

Never paste a private key, certificate bundle, password, verification code,
provisioning profile, or endpoint capability URL into chat or the repository.

## 1. Confirm account authority

- Confirm the Apple Developer Program membership is active.
- Use an Account Holder or Admin account for identifiers, certificates, and
  profiles.
- Confirm App Store Connect API access is enabled. The Account Holder must
  request access if **Users and Access > Integrations** is not active.
- Stop if Apple shows a pending agreement. Do not accept a legal agreement on
  Greg's behalf.

## 2. Register two explicit App IDs

In **Certificates, Identifiers & Profiles > Identifiers**, create explicit App
IDs with these exact bundle IDs:

| Description | Bundle ID |
|---|---|
| SociusFit Auto Meals Probe | `com.sociusfit.automeals` |
| SociusFit Auto Meals Background Upload | `com.sociusfit.automeals.background-upload` |

Do not create an App Group for this canary. The probe stores its token in the
extension's private defaults, and the host does not read it. If Apple requires a
managed capability or entitlement for the Photos background-upload extension,
record its exact portal name and stop before generating profiles. The project
must match that capability before profiles are created.

## 3. Create one Apple Distribution certificate

- Reuse a valid team Apple Distribution certificate only if its private key is
  available and authorized for this repository workflow.
- Otherwise, create a certificate signing request and private key locally, then
  create one **Apple Distribution** certificate in the portal.
- Download the `.cer` file and combine it with the same local private key into a
  password-protected `.p12` file.
- Use a new strong password dedicated to this `.p12`.
- Stop if creating the certificate would require revoking an existing team
  certificate. Review that impact first.

Keep the private key, `.p12`, and its password outside the repository. Do not
use an online converter or a shared file-transfer site.

## 4. Create two App Store Connect provisioning profiles

Create **App Store Connect** distribution profiles after all required
capabilities are final:

| Profile name | Explicit App ID | Certificate |
|---|---|---|
| `SociusFit Auto Meals App Store` | `com.sociusfit.automeals` | the Apple Distribution certificate above |
| `SociusFit Auto Meals Background Upload App Store` | `com.sociusfit.automeals.background-upload` | the same certificate |

Download both `.mobileprovision` files. Do not create development, Ad Hoc, or
Enterprise profiles for the TestFlight workflow.

## 5. Create the App Store Connect app record

In **App Store Connect > Apps**, create one iOS app record:

- Name: `SociusFit Auto Meals Probe`
- Primary language: English (U.S.)
- Bundle ID: `com.sociusfit.automeals`
- SKU: a new internal value such as `sociusfit-auto-meals-probe-2026`
- User access: limit it to the smallest available set if the account contains
  other apps.

Do not create a separate app record for the extension bundle ID.

## 6. Create a team App Store Connect API key

In **Users and Access > Integrations > App Store Connect API > Team Keys**:

- Generate a **team key**, not an individual key.
- Name it `SociusFit TestFlight Probe`.
- Assign the Developer role unless the portal proves a narrower upload-capable
  role is available.
- Download the `AuthKey_<KEY_ID>.p8` file once.
- Record the Key ID and Issuer ID separately.

Do not give this key Admin access. Revoke it after the physical-device probe if
it has no continuing purpose.

## 7. Configure the protected GitHub environment

Open **GitHub > Fitness-Tracker > Settings > Environments > TestFlight**. Verify
that Greg is the required reviewer and only
`codex/auto-meal-photos-probe` can deploy.

The environment and exact branch policy are already created. Administrator
bypass is disabled. Greg can approve his own manually dispatched job. Current
readback shows no variables or secrets, so the workflow cannot sign or upload
until the remaining checklist values are entered directly in GitHub.

Add these environment variables:

| Variable | Value |
|---|---|
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APP_STORE_CONNECT_KEY_ID` | team API Key ID |
| `APP_STORE_CONNECT_ISSUER_ID` | API Issuer ID |
| `HOST_PROVISIONING_PROFILE_NAME` | `SociusFit Auto Meals App Store` |
| `EXTENSION_PROVISIONING_PROFILE_NAME` | `SociusFit Auto Meals Background Upload App Store` |

Add these environment secrets. Encode binary files to Base64 locally; do not
use a web encoder:

| Secret | Source |
|---|---|
| `APPLE_DISTRIBUTION_P12_BASE64` | Base64 of the password-protected `.p12` |
| `APPLE_DISTRIBUTION_P12_PASSWORD` | the dedicated `.p12` password |
| `HOST_PROVISIONING_PROFILE_BASE64` | Base64 of the host `.mobileprovision` |
| `EXTENSION_PROVISIONING_PROFILE_BASE64` | Base64 of the extension `.mobileprovision` |
| `APP_STORE_CONNECT_API_KEY_P8_BASE64` | Base64 of `AuthKey_<KEY_ID>.p8` |
| `PROBE_UPLOAD_BASE_URL` | separately approved private HTTPS base URL; never `/api/meals/upload` |

The endpoint secret must remain unset until its provider and deployment receive
separate approval. The workflow appends `/probe/photo` to this base URL.

## 8. Prepare internal TestFlight access

- Confirm Greg is an App Store Connect user with an internal-testing-eligible
  role.
- Create an internal group named `Physical Device Probe`.
- Add Greg to the group.
- Do not enable external testing or submit the build for Beta App Review.

## 9. Dispatch only after all gates pass

The endpoint must exist before building because its private base URL is embedded
in the signed extension. Then:

1. Open **Actions > iOS TestFlight Probe**.
2. Select branch `codex/auto-meal-photos-probe`.
3. Enter `UPLOAD TESTFLIGHT PROBE` exactly.
4. Review the exact commit before approving the `TestFlight` environment job.
5. Wait for Apple to process the upload.
6. Answer export-compliance questions accurately. The current probe uses only
   system HTTPS and no custom cryptography, but Greg owns the legal declaration.
7. Add the processed build to `Physical Device Probe` and install it through
   TestFlight on the iPhone 16 Pro running iOS 26.6.

Resource Upload Test Mode is unavailable on iOS 26.6 and does not apply to a
TestFlight build. Run the canary with normal PhotoKit scheduling and record the
elapsed time and device conditions.

## 10. Revoke after the canary

After evidence is captured:

- expire or remove the TestFlight build from the internal group;
- delete the disposable probe endpoint under its separately approved cleanup;
- remove `PROBE_UPLOAD_BASE_URL` from the GitHub environment;
- revoke the team API key if it has no continuing use; and
- retain or revoke the distribution certificate only after checking whether any
  other app or workflow depends on it.

Do not delete identifiers, profiles, certificates, or keys speculatively.
