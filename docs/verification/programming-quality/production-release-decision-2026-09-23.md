# Production artifact and next release decision

The approved preparation and staging are complete. The exact artifact is hosted
as READY deployment `dpl_2tZqnshTDrFR5EDQpgi78dcBNns7`; the custom live domain
remains on the old deployment. Protected application checks await Vercel login.
See the [staging receipt](production-staging-2026-09-23.md) for current evidence
and limits. No migration, pause, promotion or merge has occurred. The database
pre-install readback below remains a timestamped preparation result.

## Exact artifact and targets

| Item | Verified identity |
| --- | --- |
| Application source | `93539b00bef9109f4221d10c9554cd99a3f5d5fe` |
| Draft PR | https://github.com/GFooteGK1/Fitness-Tracker/pull/84 |
| Source CI | `35930249161`, successful: 3,484 tests, 19 skipped; 26 browser journeys; TypeScript/lint/build |
| Compatibility floor | `923473a04583684d3f9b150c35ffa7e0173a8e25`; identical app/public trees, package lock and build configuration |
| Retained tar | `output/app-quality-release/production-artifact-93539b0/vercel-artifact.tar` |
| Tar SHA256 | `461e0bf9e21561e0323c6c2edf53e825d48f8a8a8fc7c9f2a739798c8ea44814` |
| Tar bytes / Next build ID | 24,125,440 / `u93phgwCcXfUdAb5YKaBh` |
| Vercel project / team | `prj_RocmjxStsTrtmrDaqMddMnb29ENh` / `team_zjdKVgrSBNAYC9gql0Raiocm` |
| Scope / domain | `gregs-projects-98860c8b` / `www.sociusfit.com` |
| Current production | `dpl_5kZSaXHLmqPPzsCy6odLJyy99utW`, READY, SHA `f123aa8aa848716e894ea7bec340d693995e4b36` |
| Supabase production | `auolnfwetmfcwhtvakzy`; PostgreSQL 17.6, database `postgres` |

The tar preserves Linux modes and relative symlinks. It contains Build Output
API v3 output and the fixed project link. It excludes local dotenv input files,
host credentials and private server secrets. Do not reconstruct it from the
Windows `.next` build. Preserve the original tar and verify its SHA before any
later extraction/upload. It is retained on this host only, not hosted or backed
up off-device as a tar. The extracted output has since been staged on Vercel;
the original tar remains host-local.

This is a compatible build of the same application as the candidate. It can
recover an artifact/deployment problem; it is not a different implementation for
rolling back an application defect. A code defect may require fixing forward
while coaching writes remain paused. The old live application is incompatible
with the new revision fence and is not an acceptable post-migration rollback.

## What passed

- Pinned Linux amd64 Node 24.13.1, Vercel CLI 56.4.1 and Next builder 4.20.4;
  Next 15.5.25 from the unchanged lockfile. Dependencies were installed before
  production public inputs entered the container. The build ran disconnected
  from every external network, with no host mounts, ports or credentials.
- `vercel build --prod --standalone` completed. Verification covered 939 regular
  files, 186 function entries including aliases, 183 contained relative symlinks,
  service worker, production public URL/key hashes and function entrypoints.
  No native addon/shared-library files were present in retained output.
- Independent source-archive reproduction matched both host and container
  archives. Seven coaching API modules/handlers were checked. All six capability
  expressions still read runtime environment variables; absent build-time flags
  did not freeze those branches.
- One live, TLS-verified read-only catalog/ledger query confirmed seven
  prerequisites, all 90 public function hashes, forced RLS on 14 existing scoped
  tables, required function privileges, and both new migrations/objects absent.
  The exporter was verified stopped. No athlete rows or application RPCs were
  accessed by this refresh.
- 69 of 70 metadata groups matched byte-for-byte. The workouts-column difference
  is exactly `extensions.uuid_generate_v4()` versus `uuid_generate_v4()` in one
  default across the same 28-column payload. Two independent reviewers reproduced
  both hashes from earlier encrypted source metadata. The exact qualification
  was tested, then the retained readback was reclassified without another source
  query. Raw inequality and the original rejected receipt remain visible.

Receipts: [artifact](production-artifact-2026-09-23.json),
[compiled runtime references](production-artifact-runtime-readback-2026-09-23.json),
[target metadata](production-release-target-2026-09-23.json),
[qualification proof](release-workout-default-qualification-2026-09-23.json), and
[investigation](../../../handoffs/investigations/programming-quality-production-artifact.md).
The build container was stopped after export and verification. This is local
structural/build evidence; hosted runtime execution is not claimed.

## Approved staging procedure (executed)

Greg approved the production-target **staged deployment** on the existing Vercel
project using the exact retained tar. The procedure below was executed once and
succeeded. No paid project, plan, backup add-on or dependency was added. Hosted
application verification remains pending as recorded in the staging receipt.

After verifying the tar and project binding, preserve its Linux structure in a
clean upload directory and use pinned CLI 56.4.1 through an explicitly authorized
official login. The deployment command is:

```text
vercel deploy --prebuilt --prod --skip-domain --scope gregs-projects-98860c8b
```

Do not pass environment overrides, invoke `vercel pull`, rebuild, use `--public`,
or merge the PR. Record the resulting deployment ID and verify READY status,
production target, runtime environment bindings, static assets/build ID and
unauthenticated access boundaries. Confirm the current production-domain mapping
still points to the old deployment. No authenticated athlete operations or
synthetic account/data creation are included in this staging approval.

The retained configuration includes the existing WHOOP sync cron at
`30 10 * * *` UTC. Staging must be treated as capable of executing this existing
production-connected schedule: `--skip-domain` prevents automatic domain
promotion, not all server execution. Approval for staging includes that possible
existing WHOOP sync effect. If the operator wants cron suppression instead,
prepare a separately identified artifact/configuration decision; do not silently
strip the cron or call the staged deployment isolated.

Vercel documents [staged deployment domain behavior](https://vercel.com/docs/cli/deploy)
and [production cron execution](https://vercel.com/docs/cron-jobs). These sources
do not prove that a staged deployment cannot run cron. This packet makes the
conservative boundary explicit instead of claiming it is inert.

The existing exercise-preference flag is a production **sensitive** variable.
Its binding exists, but its plaintext value cannot be read through metadata.
Preserve that binding; do not reset it to manufacture evidence. The five newer
runtime flags remain absent, and `initialDosePolicy` is hard-disabled. Sensitive
variables are [non-readable after creation](https://vercel.com/docs/environment-variables/manage-across-environments).
Runtime secret validity and effective flag behavior remain hosted checks, not
facts established by a successful local build.

## Later cutover decision, after staged evidence exists

Staging approval does not authorize these steps. Prepare the final execution
receipt with the actual hosted artifact ID, current metadata and synthetic-write
scope before requesting the production cutover:

1. Verify fresh target identity, exact artifact and required CI. Establish the
   hosted compatible recovery target and explicit promotion/recovery commands.
2. Install only the pause migration, verify its definitions/permissions, then
   commit the tested generation-checked pause and independently prove drain.
3. Capture a fresh consistent encrypted recovery snapshot under the committed
   coaching-output pause. The prior verified 93-table restore proves the method
   for its retained archive; it does not capture later writes. The pause does
   not freeze unrelated database traffic.
4. Apply the missing revision migration, verify exact definitions/ledger, then
   promote the pinned compatible artifact. Preserve schema and accepted records
   on any application recovery; do not roll back to the old unstamped writer.
5. Run the explicitly authorized checks, commit a generation-checked resume,
   and verify fresh stamped writes/immutable replay. Successful application
   writes cannot be demonstrated while the global gate remains committed closed.
   Define the controlled resume/smoke-test/re-pause sequence before execution.

Installation order is deliberately **pause before revision**, regardless of
lexicographic filename order:

| File | SHA256 |
| --- | --- |
| `20260923010000_coaching_write_pause.sql` | `6c336015b78142da07a091d9f999d7019c13d9ec819064cfd4b82ee16d48a041` |
| `20260921010000_coach_proposal_context_revision.sql` | `0a2983e79dfbfc7dada724d3af80916b74b61f50e4e0ee32056e5b7dd694f58f` |

Use the [pause operator procedure](coaching-write-pause-operator.md) and existing
[local rehearsal evidence](local-pause-and-rollback-2026-09-23.md). No broad
database push, automatic retry loop, production restore, data deletion, flag
activation or numeric VBT programming policy is part of this preparation.
