# ADR-0006: Camera-close Shortcut pilot

- Status: Accepted for the local implementation pilot; release and device qualification pending
- Date: 2026-10-01
- Decider: Greg Foote, through approval to implement the September 30 plan
- Amends: ADR-0005 trigger/setup boundary only

Greg proved Camera-close automatic execution and latest-photo access through Shortcuts on his locked iPhone. PhotoKit background-extension scheduling remains unresolved. A per-device Shortcut is acceptable for this pilot.

Use the existing narrow native companion with a host App Intent invoked on Camera close. Keep the web nutrition product and shared analyzer. The first implementation is a local diagnostic thumbnail-read action, not ingestion. Complete physical-device qualification before implementing the downstream automatic lane.

Retain local screening, private candidate ingestion, review-first nutrition and idempotent delivery from ADR-0005. Jev is text-only according to current TypeSafe documentation and cannot replace local image classification. No cloud image screening or automatic canonical meal creation is authorized by this decision.

Keep PhotoKit diagnostics and the Apple support sample separate. The first action uses app-private evidence and does not enable the extension. An already enabled extension remains separately controlled; the device test must disable it before asserting local-only behavior.

Host intent authentication allows locked invocation. Photos access is still explicitly granted in the app. Diagnostic file protection permits access after the first unlock since reboot, not before it. Test this boundary and full-resolution access separately from successful thumbnail access.

Sources: [App Intent authentication](https://developer.apple.com/documentation/appintents/appintent/authenticationpolicy), [Photos network access](https://developer.apple.com/documentation/photos/phimagerequestoptions/isnetworkaccessallowed), [TypeSafe state](https://docs.typesafe.ai/concepts/state).
