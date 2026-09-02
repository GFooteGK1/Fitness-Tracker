# Qwik VBT import migration verification — 2026-09-01

## Result

The local Qwik persistence migration passed repeat-apply and rollback-only
verification in a disposable PostgreSQL-compatible database. The canonical SQL
exactly matches its timestamped Supabase migration mirror.

This is local implementation evidence. The migration has not been applied to a
Supabase project or production.

## Scope

The verifier exercises the migration after the layered adaptive evidence
migration. It checks:

- the `measurement_imports.idempotency_key` constraint and owner-scoped unique
  index;
- authenticated-only execution of `record_qwik_import_v1`;
- absence of authenticated direct table writes;
- raw-artifact columns remaining null;
- normalized Qwik set, load, repetition, and velocity persistence;
- `pending_review` and `unverified` trust state;
- incomplete state for unresolved movement mappings;
- identical idempotent replay and same-file duplicate handling;
- rejection of a mismatched idempotency retry;
- rejection of raw JSON and bar-path payload keys;
- atomic rollback when any normalized set conflicts;
- cross-user isolation; and
- rollback of all verification fixtures.

## Executed evidence

A disposable PGlite 0.5.8 / PostgreSQL 18.3 harness created the required auth
and coach-schema prerequisites, then ran:

1. `20260901152000_layered_adaptive_evidence.sql` twice.
2. `20260901183000_qwik_vbt_import.sql` twice.
3. `verify-qwik-vbt-import-migration.sql` to completion.

The final verifier state was `rollback-complete`. The disposable harness and
runtime were removed after the successful run.

Vitest also checks the migration text, its exact mirror, required RLS and grant
assumptions, raw-payload exclusions, idempotency behavior, and the parser/API
boundary. The browser-compatible parser tests prove that only its normalized
submission passes the route reader and that adding raw JSON or a bar-path key
fails closed. Full repository quality-gate results belong in `HANDOFF.md`.

The athlete-facing Program flow was also exercised in Chromium with the actual
`qwik-vbt-json-1.10` fixture. At 390 px the local preview showed normalized set,
velocity, mapping, issue, and source-hash summaries without horizontal
overflow. A deliberately interrupted first save preserved the preview and the
second save reused the exact request body and idempotency key. Inspection of
both requests confirmed that the transport contained normalized measurements
and provenance only, with no raw JSON or bar-path arrays. The same surface had
no horizontal overflow at 320 px, no sub-44 px controls, and no sub-16 px form
text.

## Production status and remaining gate

The layered evidence and Qwik migrations were applied to production after
explicit approval on September 1, 2026. Migration history, live object readback,
an empty dry run, and database lint passed; no Qwik rows were created. Direct
production execution of the apply-twice and rollback-only verifier remains
unverified. See `adaptive-coach-production-application-2026-09-01.md`. The route
deployment and authenticated preview/save/review canary remain separate gates.
