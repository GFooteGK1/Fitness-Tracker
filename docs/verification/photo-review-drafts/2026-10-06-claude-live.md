# Approved Claude photo qualification

The single approved live Claude test passed on 2026-10-06. Greg approved the
previously prepared granola-photo test, capped at one request and 1,024 output
tokens, using the existing Anthropic key. No other provider request was authorized
or made. The source remained local and uncommitted; no release was performed.

## Bound evidence

The original JPEG was 118,614 bytes, SHA-256
`80c423882007dbc0d47af9045caecf169dbbd91a401cf1822efd845197fa06ea`.
Before execution, all 21 files in `next-stage-source-receipt.json` matched their
reviewed SHA-256 values. The same 21 hashes were unchanged after the run.

| Observation | Result |
| --- | --- |
| Model / provider | `claude-sonnet-4-6` / Anthropic |
| HTTP requests / SDK retries | 1 / 0 |
| Input / output tokens | 1,414 / 223 |
| Output cap | 1,024 tokens |
| Provider request | `req_011CfmLTjNQh1BsLgnwAko6s` |
| Started / completed UTC | 16:56:23 / 16:56:50 |
| Test / launcher exit | passed / 0 |
| Hosted database writes | 0 |

The preserved start marker, finish marker and matching live receipt are under
`output/photo-review-drafts/`, with the photo SHA in each filename. The launcher
refuses another attempt for the same photo. No retries or further provider calls
are authorized by this successful test. The receipt contains no photo bytes,
credential values or raw model response.

An independent read-only audit verified the matching markers, request count,
token cap, provider request ID, exit status and five transitions. It recalculated
all 21 reviewed hashes and found no change during the run. No audit rerun or
additional provider call was made. The preserved live receipt SHA-256 is
`43dcdf75a72aa335409ce2fd335cbc305f4ec4635f683b95692238545fd03553`.

## Verified behavior

The actual analyzer accepted the live provider response, then the actual route
handlers executed current PostgreSQL capture functions in isolated PGlite:

1. Analysis created only a review draft; there was no meal or nutrition change.
2. Reload and exact replay returned the existing draft without another analysis.
3. A portion correction increased the draft revision and still created no meal.
4. Acceptance plus exact replay produced one meal, matching corrected totals,
   retaining model-estimated macro origins and confirmed occurrence. No image
   storage was enabled.
5. Dismissal of a copied estimate created no additional meal or provider request.

Auth/HTTP database transport was replaced by the local fixture. This is a real
Claude response flowing through local routes and SQL, not proof of hosted
Supabase Auth/PostgREST, independent backend locking, physical iPhone behavior,
food classification quality or macro accuracy. No real nutrition-history rows
were changed. Existing unrelated work and all previous evidence were preserved.

## Remaining release boundary

The next step is a reviewed preview release and a real iPhone draft/reload/
correction test. Prior target inspection found the Vercel connector in Edu Ops
Projects, without access to the SociusFit scope `gregs-projects-98860c8b`. Correct
team access, target provider/capture-flag readback and explicit commit/push/release
authority are still needed. Preview shares production Supabase; no synthetic
hosted writes are permitted as a canary. Real meal acceptance is a separate
explicit athlete action.

The Camera-close discovery connection and unattended uploads remain later work.
Decisions API is deferred. Beads remains unavailable; no canonical task was
claimed or closed. See [preparation](2026-10-06-next-stage.md) for the exact
qualification contract and [implementation](2026-10-06-local.md) for source/tests.
