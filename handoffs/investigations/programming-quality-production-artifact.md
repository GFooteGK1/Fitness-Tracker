# Production artifact preparation — September 23, 2026

Issue: `Fitness-Tracker-i40.11`. Scope: approved production-compatible rollback
artifact preparation and read-only release-target refresh. No deployment,
production migration, pause/resume, merge, configuration change or spending is
authorized by this investigation. The closed private-recovery investigation and
its historical attempt counts remain separate and unchanged.

## First live release preflight classifier failure

The main task made one fixed-target, TLS-verified metadata query for project
`auolnfwetmfcwhtvakzy`. Its retained run is
`C:/Users/foote/AppData/Local/SociusFit/Recovery/release-20260923233048-22dfac49`.
The encrypted evidence is `source-release-metadata.aes` with its encryption
manifest and CurrentUser-DPAPI protected key. The main task reported successful
cleanup. No source retry was performed during this investigation.

Every classifier check passed except `existingMetadataUnchanged`. All 90 public
function definition hashes and all 70 existing group identities match the prior
hosted readback. Of those groups, 69 hashes match. The only difference is:

| Relation/category | Prior hosted hash | Current hash | Current rows |
| --- | --- | --- | --- |
| `public.workouts` / `columns` | `826dacdb2e159803a162a9bf1c073ad4` | `66f7424856047a9ba8407991d8fb12c4` | 28 |

This is the **first live failure of the release metadata classifier**, not a
failed deployment or another recovery restore. The query remains read-only and
does not invoke application RPCs or read athlete rows. The new metadata output
did not capture `search_path` or raw column definitions; its hash alone could not
establish the cause. No mismatch was automatically accepted.

## Retained-evidence diagnosis

The earlier authenticated source catalog in
`backup-20260923220856-d35a0ccf/source-manifest.aes` contains all 28 workout-column
definitions. An offline diagnostic decrypted that catalog only in memory and
reconstructed the exact ordered JSONB fingerprint payload. Its hash equals the
new query's `66f7424856047a9ba8407991d8fb12c4`.

Changing only one exact default expression from
`extensions.uuid_generate_v4()` to `uuid_generate_v4()` reproduces the prior
`826dacdb2e159803a162a9bf1c073ad4`. Every other column name, position, type,
nullability, identity/generated marker and default stayed unchanged. This
establishes that the observed hash pair is fully explained by the extension
qualification used by the PostgreSQL deparser. It does not claim a captured
session setting that the query did not record.

Sanitized local evidence, containing only counts/hashes and result booleans:

- `output/app-quality-release/release-metadata-differences.json`
- `output/app-quality-release/release-workout-default-analysis.json`

The first offline counterfactual diagnostic used payload index 7 instead of 6,
so it changed no default and was inconclusive. It already reproduced the current
hash, but its qualifier counterfactual was not valid. The original output is
preserved as
`output/app-quality-release/release-workout-default-analysis-inconclusive-index.json`.
After that mechanical index correction, both expected hashes matched with
exactly one changed default. This involved no source connection or database
execution.

The classifier now binds this exact table/category/count and observed hash pair
to the [sanitized proof](../../docs/verification/programming-quality/release-workout-default-qualification-2026-09-23.json).
`metadataComparison.rawExistingMetadataUnchanged` remains false; the separate
`existingMetadataMatchesReviewedDefinitions` check permits only this disclosed
qualification with all 69 other group hashes unchanged. The independent public
function and security checks still apply. No arbitrary schema qualifiers are
stripped and unexplained future differences fail closed.

An independent agent reproduced both hashes from the retained catalog without
SQL and identified the sole changed expression as the `id` column default. Seven
focused tests now pass, including one-byte hash, count, table/category and second
group-difference rejection. The main task retains the original failed receipt
and owns independent final review plus reclassification of that same captured
metadata. No source rerun is necessary for this correction. This diagnosis and
qualification do not mark the release ready.

## Preparation checks and limitations retained

- Six local Vitest checks passed for the metadata query/classifier. The SQL ran
  against the actual prerequisite migration fixture with a clearly synthetic
  migration ledger; actual pause/revision migrations were then detected.
- Full TypeScript check passed after fixing inferred JavaScript check-object
  typing and adding the synthetic count-query row type. The earlier typing
  failure remains a preparation issue, not a source execution.
- A guarded read-only attempt on the existing local PostgreSQL 17 canary failed
  because its bootstrap has no `supabase_migrations.schema_migrations`. Nothing
  was created to conceal that missing prerequisite. The main task stopped further
  local database attempts; this does not constitute successful PG17 ledger-query
  validation.
- Review corrected the backend/client TLS distinction before the source query:
  a session-pooler backend may report `pg_stat_ssl.ssl = false`; independently
  verified client TLS and fixed-target transport remain mandatory.
- Query SHA256 at the source read:
  `37b2eb148c248fcb128951db763827b6c9e81699588099f301d83e5c5ab5f2da`.
- Candidate file SHA256 values remain separate from ledger/catalog hashes:
  revision `0a2983e79dfbfc7dada724d3af80916b74b61f50e4e0ee32056e5b7dd694f58f`;
  pause `6c336015b78142da07a091d9f999d7019c13d9ec819064cfd4b82ee16d48a041`.

No automatic source retry is part of this handoff. The main task owns further
artifact entries, independent review, attempt accounting and any remaining
target-specific release approval.

## Local artifact build and resolution

First offline build stopped before Next compilation:
`Cannot find module '@vercel/build-utils'`. Pinned CLI 56.4.1 already contained
build-utils 13.34.0 in `/tools/node_modules`; the separately installed builder
could not resolve that directory. An offline import check with
`NODE_PATH=/tools/node_modules` passed. The second build used that existing
directory, with the network still disconnected, and completed in 30 seconds.
No download, credentials or production call was added to the build. Both logs
remain `build.log` and `build-2.log` in the ignored artifact directory. This
blocker is resolved after one failed build and one successful corrected build.

Source/input guards verify archive and public input hashes before build and
record observed tool versions. Independent review reproduced the exact source
archive. Output verification passed 939 files, 186 function entries, 183 relative
contained symlinks and zero native addon/shared-library files. The retained tar
is 24,125,440 bytes, SHA256
`461e0bf9e21561e0323c6c2edf53e825d48f8a8a8fc7c9f2a739798c8ea44814`.
The builder was stopped with readback after export. No hosted artifact exists.

## Retained metadata correction completed

Independent review reproduced the exact default hash pair and approved the
narrow count/table/category/hash-bound exception. Seven classifier tests passed,
including rejection of unrelated differences. The original rejected source
receipt remains unchanged. Authenticated retained metadata was reclassified
without another source connection. The passing
`production-release-target-2026-09-23.json` explicitly records raw equality=false
and the qualification. This stage made one source query in total. No unresolved
execution blocker remains in the approved preparation scope.
