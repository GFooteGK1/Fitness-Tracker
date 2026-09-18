# W1 database verification

Date: 2026-09-17. Base: 61d04df9dad3dfe88a9594fff28be06a72899741 plus uncommitted optional-feedback patch.

Migration: supabase/migrations/20260918010000_optional_session_feedback.sql, mirrored byte-for-byte at docs/migrations/optional-session-feedback-migration.sql. The existing atomic contract remains 2; feedback schema 1 replays its original payload. Feedback schema 2 permits explicit unknown values and verifies per-field provenance. Session RPE observations carry a server-allocated checkin ID/revision. The legacy endpoint keeps v1 and locks session before program, matching atomic/signal entrypoints.

Executed `node node_modules/vitest/vitest.mjs run test/database/optional-feedback.test.ts`: 5 tests passed. The harness applies the full local coach prerequisite chain, applies the new migration twice, and executes the original atomic v1 SQL verifier before v2 cases. Cases cover unknown feedback/no observation, exact replay/mismatched input, explicit no pain/7.5 RPE with one source-bound observation and null integer projection, invalid type/version/forged provenance, skipped/stopped work, tenant denial, anonymous execute denial and stale plan.

This is real embedded PostgreSQL through PGlite with synthetic tables/users. It is not production schema readback, a multi-connection race test, browser evidence or qualified coaching validation. Signal capture and app readers/UI remain separately in progress; W1 is not closed. No athlete/provider/production calls.

Failed implementation attempt: a Python generation assertion detected two observation insertion occurrences before writing; replaced with scoped patches. The executable SQL tests passed on first run. Adding legacy lock-order compatibility preserved all five passing tests. Earlier documentation patch attempts failed exact-context validation before writing; corrected using exact single-hunk context.

Independent review found a second legacy entrypoint, finalize_program_workout. The new migration now explicitly rejects feedbackVersion there, preserving its clean v1 contract. New executable downgrade tests cover both legacy RPCs. Combined optional-feedback plus signals: 51 tests pass (6 + 45).

A proposed fractional legacy-runner projection test exposed the existing in-progress-link/atomic-terminal constraint incompatibility before reaching finalization. Reassessed after this one failure: no current app caller uses that runner; retained its original v1 projection instead of relaxing the canonical constraint or expanding scope. Removed the unreachable new behavior test. W1 v2 fractional behavior remains verified. A separate Beads issue tracks dormant runner reconciliation; the new v2 endpoint cannot downgrade to it.
