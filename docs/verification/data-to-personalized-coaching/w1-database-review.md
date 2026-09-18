# Independent W1 feedback database review

Reviewer: separate signal-SQL agent; reviewed the parent-owned `supabase/migrations/20260918010000_optional_session_feedback.sql` and `test/database/optional-feedback.test.ts` against the current pre-W1 migrations and plan W1. This is an independent bounded implementation review, not the later W9 integrated review.

## Verdict

No unresolved important finding remains in this bounded SQL review. One important legacy-version gap was reported, repaired by the parent and independently rechecked. Integrated app/readers and multi-connection race verification remain outside this verdict.

## Resolved finding

**Important — the callable legacy runner finalizer also needs an explicit new-version rejection.** The old `public.finalize_program_workout(uuid,uuid,integer,jsonb,timestamptz,text)` remains granted to authenticated callers at `supabase/migrations/20260730130953_coach_workout_runner_v0_5.sql:1188`. Its response validation at line 929 only checks `schemaVersion = 1`; it does not reject a `feedbackVersion` field. A mixed payload with `schemaVersion: 1`, `feedbackVersion: 2`, and otherwise valid old feedback passes that validation and is concatenated into the persisted check-in payload. New stored-feedback decoding treats conflicting versions as invalid. The new migration correctly guards the legacy `record_coach_session_result` endpoint, but initially leaves this other callable endpoint unchanged.

Requested repair: add a compatible replacement of the runner finalizer that rejects new/conflicting feedback discriminators while preserving its clean v1 execution and replay path, or explicitly implement compatible v2 support if that is the chosen W1 scope. Do not rewrite the applied runner migration. Add executable coverage for both valid old feedback and rejected mixed-version input. The original finalizer's rounded integer workout-RPE projection is legacy behavior; it must not be reused as evidence of explicitly reported new feedback or as exact fractional effort.

Finding reported to the parent before any parent-owned file mutation. The parent added the runner-finalizer replacement to the new additive migration at line 1002; its validation at line 1040 now rejects any `feedbackVersion` on the v1-only endpoint. Its clean v1 projection and replay behavior remain unchanged. Added regression calls both legacy endpoints with a mixed-version payload and verifies rejection before any check-in write. Independently inspected the repair and reran both database suites: 51 tests passed. This resolves the reported discriminator gap. The verified exact fractional projection belongs to the new atomic feedback-v2 path; it is not a claim about the dormant legacy runner.

The parent attempted a successful legacy runner-finalization test and found a pre-existing chain incompatibility: the September atomic `prescribed_sessions_workout_terminal_check` prevents the old runner from creating its in-progress prescribed-session link. No current app caller of the old runner finalizer was found. The parent retained the old v1 projection, kept the new mixed-version rejection, and left the legacy runner incompatibility for a separate Beads follow-up rather than weakening the canonical link constraint. This reviewer inspected that existing constraint and confirmed the finalizer retains its old integer projection. A successful legacy runner-finalization journey is not claimed by this review; the original v1 atomic verifier exercises a different endpoint.

## Checks without important findings

- New feedback v2 has exact numeric discriminators, strict field whitelist, nullable field types and bounded half-step session RPE. Nested provenance must equal values derived from explicitly supplied fields; clients cannot supply persisted check-in identity metadata.
- Canonical creation, check-in, typed observation and session linkage stay in one transaction. Null session RPE does not create an RPE observation; explicit fractional RPE remains in the typed observation and does not become a rounded integer projection.
- Observation group/value provenance identifies feedback version, generated source check-in UUID, revision and field. The check-in UUID is allocated before the typed RPE observation and persisted in the same transaction.
- Atomic completion retains payload-matched replay before terminal and active-plan checks. Original v1 verification executes against the replacement migration, which is also reapplied to test compatibility.
- The replaced legacy `record_coach_session_result` now shares session-before-program lock order with atomic completion and signal capture. Its old payload structure remains unchanged, while new feedback cannot silently downgrade through that endpoint.
- Definer functions use an empty search path, authenticated owner filters and restricted execution grants, including explicit revocation of service-role defaults.

## Executed evidence and limits

Ran both `test/database/optional-feedback.test.ts` and `test/database/session-capture-signals.test.ts` together after the repair: **51 tests passed**. These include real PGlite SQL execution of both new migrations and the existing chain. The six feedback tests cover original v1 verifier/replay, unknown feedback, source-bound fractional RPE, malformed/version/provenance rejection, skipped/stopped behavior, owner/anonymous/stale-plan denial, and mixed-version rejection on both legacy SQL entrypoints. The signal suite additionally exercises new-feedback completion against saved exercise-report guards.

No multi-connection PostgreSQL scheduling, live deployment or browser behavior was independently exercised by this review. Full W9 integration and qualified numerical-policy validation remain separate.
