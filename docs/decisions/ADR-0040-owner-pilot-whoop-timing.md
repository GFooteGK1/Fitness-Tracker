# ADR-0040 - Retain WHOOP timing for the single-owner pilot

- **Status:** Proposed
- **Date:** 2026-10-19
- **Deciders:** Greg, Codex

## Context

PR97 truthfully exposes legacy recovery timing as unknown. Greg says other users are inactive, but the scheduled sync still selects every connected token owner without an activity predicate. Preparation must preserve their existing behavior and records without introducing account changes. Existing legacy date labels and health mappings must remain unchanged, and no historical reconstruction is authorized.

## Decision

We prepare additive nullable provider-timing columns and a fixed server-side owner filter that adds validated timing snapshots only to that owner's ordinary WHOOP upserts.

## Consequences

- Positive: existing sync triggers, authorization, provider requests, IDs, legacy dates and health calculations stay intact; no registry, new setting, credential or permission is needed.
- Positive: existing provider IDs can acquire timing from a newly received valid payload without fetching historical windows or guessing legacy evidence.
- Negative: the three tables are shared, so even nullable-only DDL briefly locks shared tables and exposes extra null columns to existing SELECT-star readers; timing storage and up to one additional upsert per mixed owner/domain batch add unmeasured cost.
- Negative: complete valid snapshots are required; malformed/incomplete timing keeps the legacy-only write and cannot erase retained timing. This deliberately leaves some available partial timing unused.
- Negative: a fixed owner digest is a rollout filter, not authentication or column-level write authorization; existing RLS and privileged-job boundaries remain unchanged. Expanding the rollout requires a reviewed code change.
- Neutral: timing_ingested_at identifies the last persisted valid timing snapshot, not every health ingestion or a measurement time. The current external read stays conservative; retaining intervals alone does not establish readiness or close the full recovery task.
- Neutral: preparation grants no production migration, release, sync, account/job change or backfill authority. Rollback reverts mapping/filter code while retaining columns and evidence.

## Alternatives considered

Enable the mapper globally because other users are inactive. Rejected because inactivity is not a sync exclusion; connected inactive accounts would silently receive different writes.

Create an enrollment registry, account flags or new permissions. Rejected because a single fixed server filter is sufficient for this pilot and avoids changing account/security state.

Read and merge old timing before every upsert, or add database merge triggers. Rejected for this bounded increment because it adds concurrency/trigger semantics. Separate homogeneous legacy-only and complete-snapshot upsert groups preserve omitted timing columns without new reads or database functions.
