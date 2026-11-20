# Exact QWIK source-to-set preparation and readback

Status: local implementation; release, durable raw storage and athlete imports remain gated. Extends ADR-0045 without changing its wire schema, persistence RPCs or retention policy.

## Decision and boundary

`qwik-exact-capture.ts` owns an inactive, byte-first local artifact/preparation/readback workflow. No UI, HTTP/MCP tool, upload route or storage adapter calls it automatically. It takes explicit source bytes and an owned canonical workout snapshot; it constructs only the existing revision-bound `amend_workout` command. Existing authorization, write/correction gates, request ledger, immutable revision/receipt and atomic SQL remain authoritative.

The artifact keeps a defensive byte copy, exact SHA-256 and local-only retention label before any decoding. It is not a durable server object. Callers must actually retain the original bytes; a hash, file name or local reference alone does not do so. A strict decoded JSON view can expose the selected original source row, unknown vendor keys and full bar path. BOM removal affects only that view; invalid UTF-8/JSON remains retained but cannot produce a projection. JSON decoding is not lexical preservation of large numeric literals or duplicate keys: exact original bytes remain the authority.

The existing bounded `RepRecording` v1 is a separate typed projection. It preserves selected ordered rep/phase facts, signed eccentric velocity/ROM, mean/peak distinction, IDs, date/date_performed, nulls and units. Unsupported numeric strings, units and timezone-naive timestamps are not coerced or inferred. Named arithmetic summaries remain separate in `rep-recording.ts`; neither means nor peaks substitute for per-rep facts.

The preparation snapshots inputs before asynchronous hashing/parsing, selects source IDs explicitly, checks owner/entity/expected revision and exact occurrence/set addresses, and requires a matching stable set ID when present (explicit null for an ID-less set). Positional addresses are valid only at the supplied revision. It never movement-name matches, creates sets or changes prescription. The complete batch is preflighted without writes; the existing tool/RPC performs the actual amendment.

The readback join requires the canonical tool's verified saved-revision response, the same owner/entity/request, exactly expectedRevision+1, exact artifact bytes/hash, source row/index and typed projection, and matching command/selection addresses and cardinality. It returns one original artifact byte array plus raw source rows and bounded recordings under their canonical addresses. It labels this as the saved revision, not necessarily current state. A recovered old receipt remains historical after later correction. This is consistency checking, not authentication of caller-fabricated responses; callers must use the existing authorized canonical readback.

## Identity and correction

- Exact request replay uses the existing request ID/fingerprint/receipt, including after response loss. Do not resubmit under a new ID or infer no write from absent status.
- File SHA identifies bytes, not a real set. The workout-local recording scan now conservatively rejects equal source system/format/set IDs at different canonical sets even if re-export file hashes differ. Without a verified namespace, this means ambiguous overlap requiring review, not proved equality or automatic merge.
- Distinct source IDs remain distinct even with identical measurements. Similarity, exercise names, timestamps and measurement equality never create identity.
- Explicit replacement at the same path requires prior fileSHA/sourceSetID and current revision; old recording/provenance remains in the immutable prior revision. Existing scalar summaries and unrelated fields remain unchanged. No new recording-derived performance observations exist to supersede in this slice.
- This scan is only within a workout and the existing typed adapter. It is not an owner-wide registry, a direct-SQL constraint, cross-workout deduplication or a globally stable device namespace.

## Verified source pipeline, not assumed

Attached `velocity.recording` persists in canonical workout blocks and immutable activity revisions through existing amendment SQL. No SQL trigger/RPC bridges it to performance observations. The older wrapped1.10 `record_qwik_import_v1` creates separate import/groups/values and explicitly leaves raw artifact fields NULL; it does not attach to a canonical set. `record_coach_session_result_v2` accepts its allowed caller-supplied observations, not recording promotion. Existing numeric/compiler readers remain unchanged.

## Future gated storage/reconciliation design

Before server-durable full source retention: define owner-scoped artifact storage/access/deletion/expiry, size and MIME limits, exact hash verification at both ends, immutable artifact manifests, explicit upload consent and a transactional binding to canonical revision/occurrence/set identity. Never carry full 5MB exports in the existing 65,536-byte MCP command. Do not fetch arbitrary artifact references. The prepared layered evidence schema's optional artifact columns do not mean upload is implemented; its populated CHECK branch needs explicit NULL-completeness review and disposable SQL proof before reuse.

Before cross-workout deduplication: establish a trustworthy source namespace and an owner-scoped source-set registry. Reconcile file replay, overlapping export claims, changed source content and distinct real sets separately. Record correction/supersession lineage and invalidate only dependent promoted facts in the same transaction. A same-ID collision with unknown namespace must remain an unresolved conflict. No blanket unique identity inferred from file hash/name or measurement similarity.

Historical reconciliation is read-only design: inventory evidence/identities, present explicit candidate links/conflicts and require revision-bound decisions; never auto-match, backfill or delete historical sets. Observation promotion additionally needs a reviewed mapping, units/time precision, exact source/revision links and explicit supersession/invalidation semantics. No schema, RPC, flags, compiler policy or historical data is changed here.

## Verification and rollback

Use only synthetic byte fixtures and disposable PostgreSQL via existing recording tests. Cover byte/BOM/hash/raw/mutation controls, explicit matches, stale/foreign owners, overlap/distinct identities, malformed batch atomicity, immutable correction snapshots and lost-response replay. Preserve the genuine pre-fix overlap baseline. Source/tests/type/lint and independent reviews bind the local result; browser/release/live gates remain unrun/held.

Rollback is the helper, tests/docs and the narrow workout-local duplicate rule. No database or data reversal exists. No migration was added or applied, no retention policy changed and no production import was performed.
