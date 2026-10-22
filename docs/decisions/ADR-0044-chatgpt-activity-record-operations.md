# ADR-0044: ChatGPT activity record operations

- Date: 2026-10-22
- Status: implemented locally; writes disabled pending separate activation
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

## Alternatives

1. A new transactional RPC/ledger reduces network calls but duplicates capture authority and needs migration/grant qualification. Rejected for this slice.
2. Direct table writes lose immutable provenance, derived-evidence invalidation and transactional receipts. Rejected.
3. The selected adapter reuses installed contracts, with recoverable multi-step preparation and current canonical format limits. No production dependency or database migration is needed.

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

Repository policy is conservative: this task authorizes a local commit, not publication. Authorize push/draft PR, merge and deployment separately. Verify the exact runtime has the already qualified capture/revision and fractional-effort migrations, current auth/grant behavior and unchanged permissions. After owner approval, activate the four named tools with the single flag and refresh the plugin's tool listing if needed. No OAuth scope/grant expansion is proposed.

For a bounded live canary, name one actual completed workout and one actual consumed meal, exact contents/provenance and request UUIDs. Create once, read back, retry identical commands, then make one specifically approved correction per returned revision. Verify stable IDs, original receipts, current revisions and unchanged goals/plans. Never fabricate production test records. The October 22 workout can be a separate specifically approved notes/VBT correction canary; implementation did not access or change it. Rollback disables the write flag and retains valid history. Respect edge denials.
