# Qwik VBT import contract 0.1.0

**Status:** production database schema applied; application deployment pending
**Source system:** `qwik_vbt`
**Supported source schema:** `qwik-vbt-json-1.10`
**Parser:** `qwik-import-0.1.0`

## Purpose

The Qwik adapter turns an explicit athlete-selected JSON export into normalized,
typed performance observations. It preserves enough provenance to review,
deduplicate, correct, and explain the evidence without uploading the raw export
or bar-path arrays.

This adapter supplies evidence. It does not set goals, change training emphasis,
activate a plan, or promote a measurement to trusted evidence.

## Authority and support boundary

The accepted fixture and parser tests define the supported input contract. The
app does not infer undocumented Qwik formats. A missing or different
`export_format_version` fails closed. A parser change requires a new parser
version and compatibility review.

The browser reads, hashes, parses, and previews the selected file locally. It
then removes the raw export and bar-path point arrays from the payload. The
authenticated `POST /api/coach/imports/qwik` route accepts only the
`save_for_review` action with that normalized submission. The route rejects a
raw-text or bar-path key and calls the bounded `record_qwik_import_v1` RPC only
after the normalized contract passes server validation.

The Program trust center provides the athlete-facing entry flow. The athlete
chooses a local `.json` file, reviews normalized set and mapping counts, sees
bounded validation issues, and explicitly selects **Save for review**. A failed
save leaves the preview in place and reuses the exact request body and
idempotency key. A successful save refreshes Needs Review without discarding
the success message.

The response is private and non-cacheable. The save path requires a client
idempotency key between 8 and 200 characters. The source SHA-256 is computed
locally before the original file leaves browser memory.

## Durable data

Supabase stores:

- one `measurement_imports` manifest with the user, source system, exact file
  SHA-256, source and parser versions, capture times, device identifier,
  idempotency key, counts, warnings, and trust state;
- one `performance_observation_groups` row for each valid source set;
- normalized load, repetition count, and per-repetition mean concentric
  velocity values in `performance_observation_values`;
- movement mapping state, protocol identity, comparison attributes, source set
  and repetition identifiers, units, and bounded provenance.

Every imported row starts as `pending_review` and `unverified`. An unresolved or
ambiguous movement mapping is also incomplete and has no comparability key.
These rows cannot enter adaptation evidence until a separate athlete review
transition confirms the import and its mappings.

## Privacy boundary

The app stores the source hash, normalized metrics, and bounded provenance only.
The supported browser flow does not include the following content in its API or
Supabase request:

- the original JSON text;
- full vendor payloads;
- bar-path point arrays;
- video or images.

The declared raw-artifact policy is `user_retained_not_uploaded`. The athlete
keeps the original export if they want a recovery copy. Supabase raw-artifact
columns remain null. Only bar-path presence and point count can appear in
bounded normalized provenance.

## Idempotency and correction

The RPC serializes writes by user plus file hash and by user plus idempotency
key. The outcomes are:

- same key, hash, schema, and parser: `replayed`;
- a different key with the same user-scoped file hash: `duplicate`;
- same key with different content or parser identity: reject with a conflict;
- first valid request: atomically record the manifest and all normalized rows.

Imports are append-only. A later trust or correction surface must confirm,
reject, supersede, or exclude rows without rewriting source history. Dependent
derived evidence must be invalidated and recomputed after correction.

## Bounds and failure behavior

- Maximum raw request text: 5,000,000 UTF-8 bytes.
- Maximum sets per import: 1,000.
- Source set and repetition identifiers must be unique and bounded.
- Times, load, RPE, metrics, movement mappings, and normalized value shapes are
  validated in the parser and again at the RPC boundary.
- Raw payload keys in a normalized set are rejected by the RPC.
- Authentication happens before parsing.
- A malformed file, unsupported version, partial set, conflict, or database
  error creates no partial import.

## Non-goals

This contract does not include automatic plan changes, raw-file retention,
Qwik account synchronization, vendor scoring, or support for formats that have
not been captured and tested. The Program trust center owns the in-app file
picker and the separate trust/correction workflow.
