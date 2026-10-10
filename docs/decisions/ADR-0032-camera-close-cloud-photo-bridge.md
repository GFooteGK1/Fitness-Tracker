# ADR-0032 - Camera-close cloud photo bridge

- Status: Accepted for local implementation; native compilation and release qualification pending
- Date: 2026-10-10
- Authority: Greg approved this integration after reporting the selected-photo GPT preview tests passed.
- Amends: ADR-0005/0006 unattended trigger and cloud-screening boundaries, and ADR-0031's selected-photo-only scope for this separate opt-in lane.

## Decision

Use the existing Auto Meals companion's new `Log New Camera Photos` App Intent.
Pair it through authenticated `/capture/camera` with explicit consent to send new
photos, including non-food and sensitive scenes, to OpenAI screening. Food
candidates continue through Socius's configured cloud macro analyzer. A photo
does not establish consumption; only authenticated web draft acceptance writes
nutrition. Existing local probe actions and the PhotoKit extension stay separate.

The phone stores a high-entropy, device-scoped capability in Keychain rather than
a web session or provider key. The server stores its SHA-256 hash and owner,
consent policy and 90-day expiry. Authenticated setup permits five active devices
and ten pairings per owner per day. Native requests can only submit, check status
and revoke their own access; they cannot use the generic canonical capture RPCs.
Both upload and capture-v2 flags must be enabled. Revocation remains available
while uploads are paused. Sign-out requires confirmed revocation before clearing
the session. A missing RPC is a failure, so install the additive migration before
deploying this web code, even when the bridge flag is off.

Cloud discovery enrolls a fresh Photos persistent-change checkpoint in the
device's private directory. It never reads or resets the diagnostic probe ledger.
Only insertions after pairing with capture timestamps after pairing qualify;
updates to unknown old assets cannot admit them even with future timestamps.
Imports with earlier capture dates are excluded. Photos downloads remain off.
Local state retains at most 1,000 discovery identities and 200 delivery identities,
without silent pruning or reset. Each invocation handles one pending photo.

Before first transport the phone atomically saves UUID, capture time, content hash
and submitted phase. Unknown delivery results use only that request's status:
no body resend, new identity, automatic paid retry or server claim reclamation.
A persistent per-device file lease spans awaits. A separate global enrollment
lease and short locked persistent epoch fence cross-process pair/disable races.
Disable advances the epoch before clearing Keychain. Activation and dispatch
recheck it; unreadable or corrupt state stops the lane.

Pixels are re-rendered to at most 1200 pixels per side on the phone, JPEG-encoded
and stripped of APP/comment segments across all scans. Requests contain only a
fixed `photo.jpg`, UUID, timestamp and content hash. Server transport is bounded
to 1 MiB plus multipart overhead; complete JPEG framing and dimension checks
precede `sharp` decoding with a 1.44-million-pixel limit and metadata-free
re-encoding. `sharp` 0.35.4 was already locked through Next.js; it is now declared
directly to make this runtime dependency explicit. No filenames, local asset
identifiers, location, EXIF or image bytes enter stored requests/drafts.

PostgreSQL owns admission, duplicate claim, terminal result and atomic draft
creation. Owner/device predicates are enforced inside narrowly granted RPCs with
empty search paths; native identities never masquerade as user JWTs. At most 50
new requests per device per day are admitted. A revoked/expired capability is
checked before each provider dispatch and at finish. An already dispatched call
cannot be recalled. Qualified GPT model `gpt-6-luna`, `decisions-food-v2` and both
0.9 routing thresholds remain unchanged. Refusal, uncertainty and errors do not
fall through to macro analysis or alternate providers. Calls have zero retries.

SociusFit does not persist photos. This is not a claim about provider retention.
The native host privacy manifest declares linked photo, account/device identity
and other user-content processing for app functionality. App Store privacy
settings and actual provider retention require release review; no external
privacy setting was changed in this local implementation.

## Qualification and release limits

PGlite integration tests exercise real functions, RLS, ownership, concurrency,
status-only recovery, review-only drafts and owner acceptance. Providers and
Supabase HTTP transport are mocked. React tests cover consent, late-owner fencing
and visible revocation failures. Native core tests are authored but Swift/Xcode
are unavailable on this Windows host. Source review cannot prove compilation,
Keychain protection, Photos availability, locked execution or iPhone timing.

The approved selected-photo Vercel preview has deployment protection. A phone
capability cannot bypass that browser login. Do not place a Vercel bypass secret
on the phone. A reviewed callable receiver target/policy must be selected before
integration release. This candidate does not change deployment protection,
install hosted SQL, dispatch native CI, sign, distribute, publish Git or call a
paid provider. The release procedure and device matrix are recorded separately.

Sources: [sharp input limits](https://sharp.pixelplumbing.com/api-constructor/),
[sharp output metadata](https://sharp.pixelplumbing.com/api-output/),
[Apple privacy data types](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype).
