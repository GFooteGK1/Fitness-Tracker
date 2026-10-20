# Retained provider timing in factual coaching context

The separately approved owner timing ingestion now retains WHOOP timestamps and
intervals, but the external reader selects only legacy fields and returns null
timing. This local slice exposes those existing facts through the same authenticated,
owner-filtered, SELECT-only and double-read-fenced context reader. It changes no
writer, grant, credential, sync, scheduler, fitness record or health calculation.

`external-recovery-timing-2` adds `providerTiming` diagnostics and populates the
existing provider timestamp, interval, offset and last-record-ingested fields.
Valid individual timestamps preserve stored precision and explicit offsets.
Diagnostics distinguish unrecorded, partial, invalid, future and recorded fields.
The recognized v1 mapping requires its bounded score state, four whitelisted
provenance facts, domain source identity/link format and coherent timestamp order.
Comparisons retain PostgreSQL microseconds. Future values remain exposed as
retained facts with explicit diagnostics, never current-readiness evidence.
Unknown/invalid metadata is not echoed. Arbitrary provenance keys are excluded.

Stored `cycle_id` columns are TEXT. Their canonical positive decimal strings
and numeric provider IDs are recognized only within the same safe-integer range;
the reader preserves their stored representation. Noncanonical or unsafe IDs
remain invalid. Recognizing storage format does not verify cross-record linkage.

Recovery's null interval/timezone and an explicitly null open-cycle end remain
valid. Missing columns, missing sleep endpoints and missing metadata are partial.
Each valid individual fact survives unrelated missing or invalid evidence.
`sourceLink.verification:not_joined` means retained provider IDs do not establish
that independently selected latest recovery, sleep and cycle rows belong together.
`recorded` reports recognized stored fields, not independently verified provider
authenticity, atomic snapshot generation or an unchanged health-row generation.
Timing ingestion means the last retained valid timing snapshot, which can predate
a later legacy-only health upsert.

Measurement `observedAt`, `capturedAt`, age and local-day alignment remain unknown;
`timestampPrecision:date_only` continues to describe the legacy measurement label,
not the precision of separately returned provider instants. UTC date-label statuses,
existing batch eligibility and `usableAsCurrent:false` remain unchanged. Provider
creation/update time and event interval are different facts. A recent batch or
stored timezone does not establish measurement day, readiness or scheduler origin.

Acceptance uses populated v1 recovery/sleep/open-cycle fixtures, omitted/null
legacy fields, partial/invalid/future snapshots, microsecond order boundaries,
bounded provenance, unjoined source IDs, owner rejection and changed-source409
fencing. The query-respecting fixture must fail when timing columns are omitted.
An independent requirement oracle precedes implementation; a separate reviewer
reproduces decisive checks and test sensitivity. Only local commit is authorized
for this slice. Remote CI, PR, merge, deployment and owner-runtime readback require
their separate later action authority; bridge PRs contain none of these changes.
