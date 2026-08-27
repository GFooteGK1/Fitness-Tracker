# ADR-0006: Share PhotoKit probe diagnostics through an App Group

- **Status:** Accepted
- **Date:** 2026-08-27
- **Deciders:** Greg Foote
- **Related:** ADR-0005 (automatic meal-photo native ingestion)

## Context

The signed iOS 26.6 probe can confirm Photos authorization and extension enablement, but it cannot show whether the extension runs or where processing stops. Extension-private defaults and device-only logs made the first physical canary indistinguishable from a delayed baseline, an early failure, or a job that never reached the network. Apple recommends shared persistent state for PhotoKit background-upload tracking, and the diagnostic state must remain local and privacy-safe. Build 4 needs one deterministic baseline and host-visible lifecycle proof before the product ingestion beads can start.

## Decision

We will use one registered App Group with a shared UserDefaults suite for the PhotoKit change token and a bounded diagnostic snapshot that both the host and extension can read.

## Consequences

- Positive: The host can show invocation, baseline, discovery, resource, registration, and sanitized job-result evidence without a Mac or device-console session.
- Positive: The host writes the current PhotoKit token before enabling the extension, so the first post-setup photo cannot be swallowed by a delayed first invocation.
- Positive: Shared state contains no filenames, asset identifiers, location, photo bytes, endpoint URL, or nutrition data.
- Negative: Both App IDs and provisioning profiles now depend on a registered App Group capability.
- Negative: UserDefaults is a latest-snapshot diagnostic surface, not an ordered event log, so concurrent history is intentionally not retained.
- Neutral: The disposable Worker, OPTIONS 501 contract, review-first product boundary, and prohibition on canonical meal writes remain unchanged.

## Alternatives considered

Keep extension-private defaults and rely on OSLog. This preserves the smallest entitlement surface, but it already failed the TestFlight canary because the host cannot distinguish scheduling, baselining, job registration, and early failure.

Send diagnostic heartbeats to the disposable Worker. This would expose pre-upload lifecycle evidence, but it adds network behavior before the upload boundary, cannot diagnose failures before networking is available, and weakens the local-only privacy posture.

Store an append-only event file in the App Group container. This provides richer history, but it introduces file coordination, retention, and corruption handling that the one-device protocol probe does not need; one atomic latest snapshot is sufficient for the bounded canary.
