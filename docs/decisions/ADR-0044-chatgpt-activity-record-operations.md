# ADR-0044: ChatGPT activity record operations

- Date: 2026-10-22
- Status: code merged; correction SQL applied and source version reconciled in this candidate; writes disabled pending separate activation
- Related: ADR-0038, ADR-0039, ADR-0021, ADR-0029

ChatGPT is the primary operating interface for all Socius workflows. The selected LLM interprets, coaches, authors programming and orchestrates. Socius stores durable context and performs deterministic validation and persistence. Workout and nutrition records are the first write slice of this target. Normal record creation, lookup, correction and recovery require no Socius UI.

## Decision

Expose `create_workout`, `amend_workout`, `create_meal`, `amend_meal`, `get_activity_record` and `get_activity_write_status` through existing request-local MCP owner authorization. Four writes are absent and uncallable unless `SOCIUS_MCP_WRITES_ENABLED=true`. This flag is a rollout gate. OAuth scopes, clients, grants, tokens, RLS and database EXECUTE permissions are unchanged. The prior owner credential's broader rights and original-resource qualification limitations remain.

Reuse installed capture RPCs, source revisions and receipts. A common `mcp-activity:<UUID>` ledger namespace binds the full action/input fingerprint, including operation kind and target, before mutable source reads. Arrays retain order; object keys are canonicalized. Create freezes one occurrence before its transactional commit; correction uses the audited amendment engine and expected revision. Completed program executions use its dedicated amendment RPC. Corrections change performed facts, never accepted prescriptions or goals. Canonical data, source revision and durable mutation receipt commit together. Preparation can remain pending after failure; receipt absence never proves that no late writer can commit.

Retry recovery precedes current-state normalization. Successful replies include stable entity ID, revision, provenance, event precision and a verified immutable saved-revision readback. Explicit current lookup is separate from historical receipt recovery. Lost responses are recoverable by original request ID; retain the original command and reuse its exact identity. An identical separate meal requires a new occurrence identity.

Typed workouts use existing segmented JSONB with stable set UUIDs, explicit load units, nullable amounts, effort and normalized velocity metadata. Session effort stays distinct from VBT/readiness. Readiness occupies the first block's named `session_readiness` field; its correction preserves other block content. Full block replacement is explicit and revision-bound: copy retained facts and set IDs from lookup. Notes replace notes; append by supplying retained text plus the addition. Whole-block replacement invalidates old descendant provenance overrides. Review/correction never erases estimated origin.

Compatibility boundary: older program-completion records can contain canonical blocks without `block_type`/supported `type`, or a wrapper instead of an array. The installed audited SQL projection cannot amend those representations unchanged. Metadata-only corrections return an explicit unsupported-format conflict, preserving the record and revision. Supported typed program-linked rows use `amend_program_execution`; golden fixtures prove accepted prescription and original check-in preservation. Full legacy-format amendment remains an unmet capability requiring a separately reviewed persistence extension. Do not infer a type, convert untouched work, or direct users to a UI to bypass this boundary.

Meals retain food/portion text and per-item grams/kcal to two decimal places; totals are derived. Existing canonical schema requires complete numeric macros. Missing macros explicitly reject with no canonical save; zero means reported zero. This does not establish storage for incomplete nutrition estimates. Occurrence confirmation does not confirm composition. Already interpreted structured photo estimates can be supplied with truthful provenance; this adds no media payload, paid model, upload, bridge activation or credential.

External factual projection now retains nested set arrays and supported VBT/readiness under a bounded named-field projection. Units and paths survive without summing sets, asserting independent completion or granting numeric-policy authority. Unsupported/oversized fields still produce partial coverage. Direct owner lookup supplies the complete stored activity fields when coaching context is partial.

## Revision-bound measurement compatibility

Existing segmented UI captures may have ID-less `performed.sets` arrays, retained block/score/prescribed metadata, unsupported time/distance aliases and boolean `vbt` markers. Whole-block replacement through the small create schema cannot faithfully round-trip these records. `amend_workout.changes.setMeasurements` therefore selects an existing set by block/segment/event/collection/index at the supplied workout revision. Supported collections are `sets` and `set_details`; there is no name search, ID fabrication, array conversion or missing-set creation. Replacement blocks cannot accompany this patch. Each explicit velocity leaf requires its own provenance, stored at the exact canonical path. All five velocity fields are supplied; null means explicitly unknown for nullable fields. Retained unknown velocity metadata and surrounding JSON survive. Existing estimated measurement origins stay estimated, and unrelated estimated loads retain their provenance. Measurement patches cannot change occurrence provenance.

The external reader retains boolean `vbt` true/false as unverified source context, rejects malformed marker types with a coverage diagnostic, and never infers velocity or numeric authority from the marker. Existing internal numeric/compiler/planning readers remain unchanged.

Migration `20261022164908_activity_measurement_corrections.sql` replaces the existing internal engine signature in place, preserving its OID, owner, ACL, security-definer/search-path configuration, recommendation provenance and fractional effort behavior. It adds no function, table, grant or credential. Under the existing owner and revision lock it compares stored and validated new canonical facts, ignoring only block readiness and nested performed-set velocity. Notes/effort are not projection inputs. Remaining block facts, workout date and quantity eligibility provenance remain significant. When unchanged, score/PR rows retain identity and timestamps while a new canonical revision, snapshot and receipt are recorded. Genuine source changes still recompute; callers cannot supply a skip hint. This is a conservative equivalence check, not a new numeric policy.

Workout corrections additionally require default-off `SOCIUS_MCP_ACTIVITY_CORRECTIONS_V2_ENABLED=true`. It rejects before request preparation until the migration is applied/verified and activation is authorized. The general write gate remains required. Meal creation/correction and workout creation do not depend on this SQL extension. On 2026-10-22 the owner-approved connected migration tool applied the exact reviewed SQL under server-assigned version `20261022164908`; the originally prepared identity was `20261022131056`. Stored SQL readback matched all bytes and function identity/security remained unchanged. The source rename records actual platform history without repair writes. No flag was changed; automation remains off pending source reconciliation and separate restoration approval. See [rollout evidence](../verification/llm-coaching-context/activity-measurement-rollout-2026-10-22.md).

## Alternatives

1. A new transactional RPC/ledger reduces network calls but duplicates capture authority and needs migration/grant qualification. Rejected for this slice.
2. Direct table writes lose immutable provenance, derived-evidence invalidation and transactional receipts. Rejected.
3. The selected adapter reuses installed contracts, with recoverable multi-step preparation and current canonical format limits. The first implementation reused installed contracts; the compatibility extension below prepares an in-place SQL correction. No production dependency is added.

## Next bounded slices

| Operation | Existing storage/contract | Next external slice and boundary |
| --- | --- | --- |
| Goals and requirements | Profile goals, versioned memories, training intent/setup | Owner prepare/confirm/correct tools with version binding; inferred chat facts never silently replace declarations |
| Accepted plans/sessions | Programs, plan versions, reviewed issuance/acceptance, completion links | Typed selected-LLM proposal storage and exact-content acceptance/conflict/recovery; separately qualify lifecycle |
| Assessments/VBT evidence | Strength assessments, observations, immutable Qwik imports | Owner create/correct and source-linked import/supersession; preserve vendor facts and confidence distinctions |
| Equipment/constraints | Versioned setup and exercise preferences | Explicit owner confirmation/correction, effective dates and provenance |
| Recovery | Retained WHOOP timing/read context, session signals | Subjective owner facts/corrections distinct from provider facts |
| Nutrition goals/incomplete data | Daily targets and capability-specific estimate/draft infrastructure | Versioned goal confirmation and missing-macro draft/aggregation semantics |
| Corrections/archive/export | Domain history/revisions/receipts | Discovery/paging, domain revisions and portability; destructive operations separate |
| Legacy workout formats | Canonical program completions can lack logging block types | Extend audited correction/projection to preserve original shapes; currently explicit no-write conflict |

These future slices are not implemented or activated here. Retiring embedded authoring, deployment, live writes, credentials and persistent permission changes keep separate approval boundaries.

## Activation and bounded canary

The code was merged through PR #111 and the separately approved SQL rollout is verified above. The source-version reconciliation PR, automatic database deployment restoration and write activation retain separate approval boundaries. Before activation, verify the exact runtime has the qualified capture/revision and fractional-effort migrations, current auth/grant behavior and unchanged permissions. After specific owner approval, activate the four named tools with the general flag, plus the additional workout-correction flag only after verifying the installed migration; refresh the plugin's tool listing if needed. No OAuth scope/grant expansion is proposed.

For a bounded live canary, name one actual completed workout and one actual consumed meal, exact contents/provenance and request UUIDs. Create once, read back, retry identical commands, then make one specifically approved correction per returned revision. Verify stable IDs, original receipts, current revisions and unchanged goals/plans. Never fabricate production test records. The October 22 workout can be a separate specifically approved notes/VBT correction canary; a separately authorized owner read established its source shape; implementation did not change it. Synthetic fixtures contain fabricated values only. Rollback disables the write flag and retains valid history. Respect edge denials.
