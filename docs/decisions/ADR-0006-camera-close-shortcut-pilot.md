# ADR-0006: Camera-close Shortcut pilot

- Status: Accepted for the implementation pilot; build 9 released, broader device qualification pending
- Date: 2026-10-01
- Decider: Greg Foote, through approval to implement the September 30 plan
- Amends: ADR-0005 trigger/setup boundary only

Greg proved Camera-close automatic execution and latest-photo access through Shortcuts on his locked iPhone. PhotoKit background-extension scheduling remains unresolved. A per-device Shortcut is acceptable for this pilot.

Use the existing narrow native companion with a host App Intent invoked on Camera close. Keep the web nutrition product and shared analyzer. The first implementation is a local diagnostic thumbnail-read action, not ingestion. Build 9 has user-reported unlocked/locked smoke evidence; the next local candidate implements discovery without enabling upload. Complete physical-device qualification before enabling the downstream automatic lane.

Discovery uses a separate app-private ledger rather than the background extension's shared diagnostic state. Enroll explicitly with no backfill. Save the history token and retained candidates together, then retry unresolved metadata from that snapshot. Consume changes in order and retain deletion/restoration identity without duplicate new-photo counts. Bound pilot state to 1,000 identities and fail visibly on capacity/history errors rather than resetting or silently pruning evidence. This action does not start the background extension or read image bytes.

Retain local screening, private candidate ingestion, review-first nutrition and idempotent delivery from ADR-0005. Jev is text-only according to current TypeSafe documentation and cannot replace local image classification. No cloud image screening or automatic canonical meal creation is authorized by this decision.

Keep PhotoKit diagnostics and the Apple support sample separate. The first action uses app-private evidence and does not enable the extension. An already enabled extension remains separately controlled; the device test must disable it before asserting local-only behavior.

Host intent authentication allows locked invocation. Photos access is still explicitly granted in the app. Diagnostic file protection permits access after the first unlock since reboot, not before it. Test this boundary and full-resolution access separately from successful thumbnail access.

Sources: [App Intent authentication](https://developer.apple.com/documentation/appintents/appintent/authenticationpolicy), [Photos network access](https://developer.apple.com/documentation/photos/phimagerequestoptions/isnetworkaccessallowed), [TypeSafe state](https://docs.typesafe.ai/concepts/state).
