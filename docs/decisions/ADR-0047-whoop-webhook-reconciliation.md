# ADR-0047 - WHOOP webhooks and reconciliation

- **Status:** Accepted. The production webhook is enabled. Live verification of the linked Day Strain update is pending.
- **Date:** 2026-11-21
- **Tracking:** Fitness-Tracker-9on, Fitness-Tracker-9on.1
- **Related:** [Owner timing](ADR-0040-owner-pilot-whoop-timing.md), [Owner cron](ADR-0041-owner-authenticated-whoop-cron-get.md), [WHOOP webhooks](https://developer.whoop.com/docs/developing/webhooks/), [WHOOP API](https://developer.whoop.com/api/)

## Decision

The existing daily cron and manual sync reconcile every page in a fixed query
range. The range starts at whichever comes first, the last successful
query boundary or 72 hours before this query. A missing or unusable boundary
starts a seven-day lookback. Only a completed batch advances that boundary.
WHOOP collection queries filter by when an event occurred, so the overlap
includes recent events that WHOOP scored or edited after a prior batch.

The default-off `POST /api/whoop/webhook` accepts signed WHOOP v2 sleep and
recovery updates for the configured WHOOP account and fixed Socius owner.
It checks the signature before accessing stored credentials, reads the
exact record from WHOOP, verifies its identity, and uses the existing
canonical writer. Recovery events identify a sleep, so the receiver resolves
its cycle before reading recovery. After saving recovery, the receiver reads
the same cycle and saves its Day Strain if WHOOP has scored it. The reads share
one provider deadline. An unscorable cycle leaves strain to reconciliation.
A pending score or a failed fetch or write lets WHOOP retry. If the cycle
fails after recovery is saved, that recovery remains available. Repeated
deliveries can still make WHOOP requests. No webhook updates the daily batch
timestamp.

Postgres compares provider timestamps under the row lock. Once the owner
record has a versioned snapshot, older, equal, and unversioned writes
leave that row intact. The existing timing mapper still controls which
rows obtain versions. A malformed score cannot reserve a version. A late
batch completion cannot move a valid checkpoint or its counts backwards.
The migration adds no tables, grants, or backfill.
Other owners' unversioned records continue to use the existing writer.

Today refreshes the WHOOP section on foreground return and when the athlete
returns to the Today tab. The open, visible WHOOP card also checks the saved
owner readings every two minutes and provides a refresh button. Both use the
same saved WHOOP sources. The provider timestamps remain separate from the
batch timestamp. Earlier-reading labels use the athlete's local day when a
retained source timestamp is available. Refresh preserves the current
check-in and training guidance. To request a new provider import, the athlete
can use Sync Now in the SociusFit profile.

## Alternatives and limits

- A more frequent poll still needs overlap and cannot run more than daily on
  the current Vercel Hobby plan. Daily reconciliation remains useful for missed
  events and strain changes made after the recovery update. WHOOP sends no
  dedicated cycle update event.
- A durable queue could acknowledge early and coalesce duplicate requests.
  Synchronous handling keeps one owner on the current stack and uses WHOOP
  retries. Check actual delivery latency and failures before adding a worker.
  A concurrent OAuth refresh can fail while another request rotates the token.
  The existing compare-and-save keeps the winning grant and a failed webhook
  remains retryable.
- The pilot handles updated sleep and recovery, including the linked cycle on
  recovery updates. Signed deletes and workout events receive a successful
  acknowledgement without mutating Socius.
  The recent-history poll imports present records. It does not infer deletion
  from a missing record or repair edits older than the lookback when a webhook
  also failed.

## Production verification and rollback

1. Apply the version guard before enabling the receiver. Verify the migration
   and the existing owner policies. Deploy the reconciliation change with the
   receiver disabled. Observe the next ordinary scheduled batch and compare
   provider record times with the stored sleep and recovery.
2. Verify the WHOOP profile identity against the connected Socius owner.
   With production approval, set server-side `WHOOP_WEBHOOK_USER_ID` and
   `WHOOP_WEBHOOK_OWNER_ID`. Reuse the existing WHOOP app secret. Register
   `https://www.sociusfit.com/api/whoop/webhook` as v2 in that same WHOOP app.
3. Compare sleep, recovery, and linked Day Strain in WHOOP, Socius storage,
   and Today after a scored morning and an authorized sleep correction.
   Record provider update and ingestion times,
   check retry behavior, and verify Today on the athlete's client.
4. Disable webhook delivery by removing its WHOOP registration or either
   receiver identity setting. The daily poll and stored records remain available.
   Retain the version guard with the reconciliation change. If reverting
   the guard is required, review that rollback after disabling the receiver.
