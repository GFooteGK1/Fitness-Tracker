# ADR-0030 - Selected photo review drafts

- Status: Accepted for local implementation; release qualification pending
- Date: 2026-10-06

## Decision

The first connected photo slice uses an explicitly selected and approved image,
the existing provider-neutral Socius vision analyzer (Claude by default), and
the existing owner-scoped `activity_drafts` / logging request ledger. The new
`/capture/photos` screen corrects, accepts or dismisses the resulting estimate.
Only the existing atomic `commit_activity_draft` transition creates a meal and
changes nutrition totals. Selecting a picture does not confirm consumption.

Image bytes remain transient during the approved request. Drafts contain food
items, timestamps, estimated macros and provenance, with the existing seven-day
expiry. No image is put in Supabase Storage, receipts or recovery storage. The
browser keeps only the pending request identity, fingerprint and metadata.
Occurrence confirmation is distinct from inferred macro origin. Corrections
retain `model_estimated` origin and mark edited fields `corrected`.

Photo intake and edits use the request ledger's UUID as the draft mutation key.
Lost save/finish responses recover the existing draft; they do not rerun the
model or restart an uncertain mutation. Known SQL rejection rolls back the RPC
and releases an unchanged request with explicit no-write proof. Provider errors
before any draft write permit a new, explicitly approved submission.

The existing capture-v2 pause applies to new analysis, editing and acceptance.
No new database schema, provider dependency, credential or rollout flag is
introduced. No global activation is part of this change.

## Alternatives and consequence

Creating a separate photo ingestion table would duplicate existing ownership,
revisions and exactly-once acceptance. Reusing immediate manual photo logging
would add nutrition before review. The shared draft boundary avoids both costs
but depends on the deployed capture migrations and existing flag configuration.

The existing manual meal-upload route remains its own behavior. This slice is
reached explicitly through `/capture/photos`; it is not unattended camera
logging. Camera-close discovery, qualified local food screening, durable native
upload and notification are subsequent slices. OpenAI Decisions API remains a
future classifier enhancement, with no dependency in this implementation.

## Verification boundary

Local route tests execute actual PostgreSQL functions and RLS in PGlite, with
synthetic users and a deterministic provider response. Component and browser
checks prove the interaction contract separately. They do not establish live
Supabase Auth/PostgREST, paid-provider, production or physical iPhone behavior.
