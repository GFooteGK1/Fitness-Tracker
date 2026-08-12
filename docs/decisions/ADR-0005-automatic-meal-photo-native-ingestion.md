# ADR-0005: Automatic meal-photo native ingestion boundary

- **Status:** Accepted
- **Date:** 2026-08-02
- **Deciders:** Greg Foote
- **Related:** ADR-0002 (food-photo evaluation), ADR-0004 (nutrition provenance)

## Context

Automatic meal-photo logging must work when an athlete uses Apple's Camera app
normally and never opens SociusFit. A PWA cannot continuously inspect the photo
library, and a per-device Shortcut would violate the no-special-action product
requirement. Photo-library access also creates a strict privacy boundary: a
non-food image must not leave the phone.

Apple's PhotoKit background resource-upload extension can monitor persistent
library changes after the host app receives full read-write Photos permission
and explicitly enables the extension. It can create download-only jobs for
local inspection before creating an upload job for a selected resource. iOS
controls scheduling, and Apple requires testing on a physical device.

## Decision

### Keep the web product and add one narrow native companion

The Next.js application remains the primary SociusFit experience. A minimal
native iOS companion owns only Photos authorization, extension enable/disable,
device-scoped diagnostics, and the PhotoKit background-upload extension. It is
not a native rewrite of the product.

### Filter on-device before creating an upload job

The extension tracks PhotoKit persistent changes in App Group storage. It makes
resources locally available when needed, classifies them on-device, and creates
an upload job only for a high-confidence food candidate. Location, original
filename, and PhotoKit identifiers are not request metadata. Device plus content
hash provides an idempotency key; capture time and timezone determine the meal
day. Non-food remains local.

### Keep ingestion review-first

The native client never writes canonical nutrition. A private server ingestion
record owns retries, analysis version, confidence, review state, retention, and
the eventual link to a meal. The strict shared analyzer remains the only path
from model output to validated nutrition. Automatic canonical creation remains
disabled until representative physical-device and food-photo evaluation data
support a calibrated high-confidence lane.

### Separate credential-free compilation from approved manual signing

The native project is generated from a reviewed XcodeGen specification. Pull
requests use a credential-free macOS workflow with read-only repository access.
A separate manual workflow may sign and upload one internal TestFlight probe only
after a required GitHub environment approval and exact confirmation phrase.

Apple portal resources and signing secrets remain human-managed and outside the
repository. The canary uses explicit host and extension App IDs with separate App
Store Connect profiles. It does not create an App Group unless Apple proves a
managed capability requires one. The upload endpoint and production state remain
separate approval boundaries.

### Treat Apple's upload protocol as unresolved

The current Next.js Web `Response` cannot emit an interim HTTP 104 response,
and Vercel does not document arbitrary 1xx passthrough. The physical-device
spike first tests Apple's documented non-resumable preflight behavior. If the
resumable 104 path is mandatory, a narrow raw-HTTP upload gateway becomes a
separate architecture, security, cost, and approval decision.

## Consequences

- Athletes grant full Photos access once, then use Apple Camera normally.
- Meal appearance is eventual, not instant, because iOS schedules the extension.
- The native surface stays small and privacy-auditable.
- Cloud compilation is possible without owning a Mac; physical proof arrives
  through TestFlight on Greg's iPhone after signing is configured.
- The app must disable the extension and revoke its device credential on signout.
- Limited or denied Photos access fails closed and cannot upload.
- The iOS 26.4 protocol is deprecated on iOS 27; the compatibility boundary
  must be rechecked when the deployment target moves.
