# ADR-0043: Existing camera capture to external estimate handoff

- Status: Approved bounded implementation; inactive, hosted grants and device acceptance pending
- Authority: Greg approved building/testing October20 at12:47:31UTC and standing tested commit/merge standard.

Reuse SociusFitAutoMeals on native branch46264b0 and its ordinary Camera-close
automation. Native changes target that existing branch; web changes start from
main387b93d. Do not transplant the unrelated native tree into main. The chosen
ChatGPT Shortcut action performs estimation; Socius performs validation, arithmetic,
durable storage and readback. There are no provider calls in the new receiver.

The native lane reuses NewPhotoTracking discovery/persistence, metadata-free JPEG
normalization and lease/control primitives in a separate namespace. It freezes
capture UUID, source capture timestamp and SHA-256 before image handoff. It must
not reuse CloudPhotoQueue's upload-submitted phase for an external model handoff.
Changed pixels stop the original capture rather than silently rebinding its ID.
No image is persisted by this bridge. The existing local/cloud lanes are unchanged.

The receiver accepts a bounded JSON envelope `{schemaVersion:1,capture,estimateJSON}`.
Capture has exactly requestId, capturedAt and contentHash. The model's strict JSON
object has exactly items, totals, estimatedAt and model. An item has exactly food,
portion, protein, carbs, fat and calories. Reject duplicate decoded JSON keys,
prose/fences, unknown fields and nonfinite/negative/non-numeric quantities. At most
20items, UTF-8 food256bytes/portion128bytes/model128bytes; quantities have at most
three decimal places. Sum integer thousandths and require exact supplied totals.
Per-item maxima are500g protein,1000g carbs,500g fat,10000kcal; aggregate maxima
are1000g protein,2000g carbs,1000g fat,20000kcal. These are input bounds, not goals.
Dates require valid UTC ISO timestamps; capture/estimate admission is checked by
the database against grant enrollment and server time. Model/time labels supplied
by the harness are unverified metadata, never evidence of a provider identity.

Default-off EXTERNAL_ESTIMATE_IMPORT_ENABLED protects both import and readback.
A distinct external-estimate-v1 capability/table/RPC is prepared only locally.
Camera-cloud-v1 credentials never authorize imports. No issuer, credential,
hosted migration, grant or activation is delivered by this slice. A later explicit
approval must identify the grant, owner, duration, target and activation before use.
The native import capability remains in its own Keychain entry, not the Shortcut.
No provider or service-role key is placed on the phone.

One database transaction validates the operation, inserts an activity draft and
stores its immutable import receipt. JSON object order/whitespace and equivalent
numeric formatting are not material; changed values, item order, image hash,
capture time or model metadata conflict. Original-ID readback does not write or
reclaim a request. Revocation and ownership are checked again inside the transaction.
Direct table writes and non-server RPC execution are denied. No existing pairing
scope, job or canonical meal is modified.

The saved estimate is model_estimated/unreviewed throughout, needs_review:true,
consumption:unknown and canonicalChanged:false. Capture time is a draft placeholder
labelled photo_capture_only, not a claim about eating time. Original estimate and
receipt remain readable after draft expiry or later changes. This first slice
does not confirm consumption or change canonical nutrition totals. Readback goes
to the chosen LLM flow; later explicit confirmation/correction remains separate.

Alternatives: direct photo upload would retain server model inference and misses
the selected-harness goal. Reusing camera tokens silently expands an existing
grant. Generic meal writes would assert consumption. Replacing the app discards
the working trigger and ledger. The selected boundary requires a small native
image/capture handoff plus a new inactive estimate receiver.

Verification: synthetic JPEG/image hash and persisted-state tests, strict contract
tests, actual PostgreSQL functions/grants/RLS via disposable PGlite, ownership,
atomic rollback, duplicate/conflicting/concurrent replay, uncertain readback and
default-off regressions. An independent oracle precedes code; independent review
and decisive reproduction bind frozen candidates. Unsigned native compilation
does not prove Shortcut file transport, ChatGPT response format or locked-phone
execution. Those need a separately approved owner test before private-photo use.

Release: merge web code only while the new flag is absent/false and SQL remains
uninstalled; native merge targets its existing branch without signing/distribution.
Present exact migration/grant/activation and owner device-test steps separately.
