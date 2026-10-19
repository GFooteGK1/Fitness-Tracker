# Pending decision: retain WHOOP provider timing on future ingestion

Follow-on preparation resolves the exact single-owner scope in
`../proposals/recovery-timing-owner/approval-scope.md` and ADR-0040. It keeps
legacy date/health behavior, uses `timing_ingested_at` for valid timing snapshots,
and preserves incomplete rows' previous metadata through homogeneous upserts.
That draft remains unmerged, unapplied and unapproved for production.

This document proposes future work; no migration, writer change, live sync or backfill is included in the recovery read child. Parent `Fitness-Tracker-xrz.5` cannot close on date-only legacy rows.

The [official WHOOP API](https://developer.whoop.com/api/) exposes sleep/cycle `start`, `end`, `timezone_offset`, provider-created/updated times and score state. Recovery has cycle/sleep links and provider-created/updated times, not an independent measurement interval. Recovery collection ordering uses the related sleep start. Provider creation is not observation time. Correct recovery attribution requires exact linked sleep/cycle identity; never infer the interval from record creation or nearest date.

Proposed additive nullable columns on owned recovery/sleep/cycle rows, retaining existing primary/provider IDs and RLS:

| Proposed field | Meaning and mapping |
|---|---|
| provider_created_at, provider_updated_at | timestamptz from the corresponding explicit-offset provider fields, preserving database precision; source lifecycle, not observation |
| provider_interval_start, provider_interval_end | nullable timestamptz from sleep/cycle start/end only; recovery remains null unless exact linked source and interval role are retained explicitly; open/unknown ends stay null |
| provider_timezone_offset | nullable text, validated fixed offset from the corresponding provider object; no IANA-zone inference or reconstruction of historical DST |
| provider_sleep_id on recovery, provider_cycle_id on sleep | nullable original link IDs with provider-appropriate types; never guess or coerce ID domains; reconcile existing cycle_id/sleep_id types before migration |
| provider_score_state | nullable allowlisted provider state, independent of an available score |
| last_record_ingested_at | nullable timestamptz set only when that exact row is successfully upserted; separate from database first creation and batch success |
| timing_mapping_version, timing_provenance | nullable bounded version/explicit field-origin and interval-role mapping; distinguish direct provider, linked provider, missing and invalid input |

Existing `date` is NOT NULL. Before changing ingestion, decide how missing/invalid provider time is represented without the existing fallback-to-sync-date silently becoming measurement day. Prefer a separately defined legacy date label plus nullable verified event-date/attribution fields, with explicit mapping status; do not silently relax the constraint or reinterpret old labels. The exact DDL/field types and compatibility version require schema review after that decision. Reject/mark invalid incoming timing explicitly; never fabricate midnight or `now` as an observation.

Future ingestion approval would cover additive nullable columns and future-row mapping/upsert semantics, including the changed date/error behavior, deployed through the normal reviewed migration workflow. Preserve all legacy values and leave their new timing columns null/unknown. Repeated upserts remain idempotent in identity and scores; per-record last-ingested may advance only for processed rows, even when provider content is unchanged. Batch success, including zero results, remains a separate marker. Reader version/coverage must distinguish legacy unknown, directly retained interval and explicitly linked interval. Do not infer current readiness merely because an interval becomes available.

Required proof before release: synthetic provider payloads, open/missing/malformed interval and timezone cases, exact recovery link mismatch rejection, UTC rollover and supplied spring/fall offset cases, explicit timestamp precision limits, repeated-upsert identity semantics, zero-result batch behavior, owner/RLS regressions, compatibility with existing readers and rollback. Rollback can disable new mapping/reader behavior while retaining nullable evidence; do not destroy populated evidence to roll back.

Decision needed: authorize the precise reviewed schema and future-ingestion behavior after field mapping/date policy are finalized. No historical reconstruction/backfill is authorized or implied. Any backfill, manual sync/reconnect, new scope/access or job change needs its own exact authorization. Current read-only diagnostics cannot determine provider availability, current physiological age or actual scheduler execution. Athlete records remain untouched in this child.
