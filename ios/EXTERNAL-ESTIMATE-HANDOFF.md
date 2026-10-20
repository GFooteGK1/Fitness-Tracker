# Existing Camera automation to chosen ChatGPT estimates

Prepared inactive bridge, October20. It reuses SociusFitAutoMeals rather than
creating a new capture app. No signed distribution, server activation, hosted
SQL, new credential or private-photo/model call is performed by this change.

## One-time setup after separate release/device approval

The trigger stays Camera → Is Closed → Run Immediately. Replace the selected
capture action with this lane; do not run both this and cloud photo logging on
the same capture. There is no manual shortcut launch for each photo. Closing
Camera is the trigger; this is not a shutter callback.

1. Explicitly enable the separate ChatGPT Photo Handoff in the existing app.
   It enrolls fresh discovery without backfill. Newly inserted stills, including
   imports, can qualify; code does not establish camera-only origin. The existing
   local probe and cloud photo pairing are untouched. Photos requiring an iCloud
   download are deferred; the action does not fetch them.
2. In the Camera-close automation, call **Prepare Next Estimate Capture** and
   decode its returned JSON. Preserve `capture.requestId`, `capturedAt` and
   `contentHash` as one envelope. Continue only when `state` is `prepared`.
3. Call **Get Prepared Estimate Photo** with that original ID. Its output is a
   JPEG IntentFile, not diagnostic text. Feed that file into the chosen ChatGPT
   action. Never look up the latest photo again after estimation.
4. Require strict JSON containing exactly `items`, `totals`, `estimatedAt`,
   `model`. Each item has exactly `food`, `portion`, `protein`, `carbs`, `fat`,
   `calories`. Totals have the four numeric macro/energy keys. Use the Shortcut's
   actual result timestamp in UTC ISO format, not a model-guessed clock. Use
   `unknown` if the action does not attest its model; labels remain unverified.
   Supply at most three decimal places,20items,256UTF-8 food bytes,128portion
   bytes. Totals must exactly equal item sums at thousandth precision. No prose,
   code fences, ownership, review/provenance or consumption claims are accepted.
5. Pass the original ID and estimate JSON to **Import External Food Estimate**.
   It uses a separately approved import capability kept inside Keychain, never
   an API/provider/service-role key in Shortcuts. Existing camera tokens are
   rejected. There is no issuer in this code; server configuration stays off.
6. Return the receipt/readback to the chosen LLM flow. Successful import stores
   a durable unreviewed estimate draft, `canonicalChanged:false`, consumption
   unknown. It does not add confirmed nutrition totals or infer eating time from
   the photo. Confirmation/correction is a later explicit operation.

## Failure and identity rules

Identity and normalized pixel hash are saved before image handoff. The image is
not persisted; reading an edited asset later must match that hash or stop. Only
one image handoff is allowed for an unresolved capture. An interrupted model step
stays imageHandedOff; continue its original result rather than estimating again.

Original estimate text and importSubmitted phase are saved before HTTP. Repeated
import calls check status only. **Read External Estimate Capture** never resends
an image or estimate, generates another UUID or assumes an unknown result failed.
A not-found response leaves the original identity pending. Locally invalid JSON
can be repaired and submitted using the same capture without another image
handoff. This slice does not provide automatic retry, post-dispatch rejection
repair, non-food disposition or queue reset. Uncertain output stops visibly for recovery.
Do not work around it by assigning the same photo a new identity. Pending state
is preserved on disable, corruption, capacity and transport failures.

Disable fences new dispatch across processes using the existing control primitive.
An already handed-off image or submitted request cannot be recalled. Import
configuration cannot silently replace another grant/account. This lane never
reads or rewrites existing camera-pairing credentials.

## Acceptance and exact remaining owner test

Synthetic JPEG/core tests and unsigned compilation can establish file construction,
hash/identity binding, durable state and fail-closed transitions. They cannot
establish what the ChatGPT app's actual Shortcut action accepts, output framing,
execution while locked, or Photos availability after reboot.

After separately approving signed distribution, run one controlled non-private
synthetic-image device test: record app commit/build, phone/iOS and configured
ChatGPT action; prove prepared UUID/hash → usable JPEG → strict model JSON while
unlocked, then locked after first unlock. Do not enable ordinary photo capture or
transmit private photos based only on the existing thumbnail smoke test. Server
import testing requires a separately approved owner-scoped grant, exact prepared
SQL installation and default-off flag activation. Verify one original-ID draft,
replay/conflict/readback, no canonical meal and disable before expanding use.

The web contract/SQL is a separate child of current main; native changes merge
only into the existing native branch. Do not merge this entire historical native
tree into main or dispatch the manual TestFlight workflow without new approval.
