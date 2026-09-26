# Production artifact staged; bounded hosted checks passed

Greg approved staging the retained artifact on the existing SociusFit Vercel
project, including possible execution of the existing WHOOP cron. The first
deployment attempt succeeded. Vercel reports READY. The custom live domain and
current production target still point to the previous deployment. No database
migration, write pause, domain promotion, merge or authenticated athlete operation
was performed.

## Hosted identity and preserved settings

| Item | Readback |
| --- | --- |
| Staged deployment | `dpl_2tZqnshTDrFR5EDQpgi78dcBNns7` |
| URL | https://fitness-tracker-je2rwxwh4-gregs-projects-98860c8b.vercel.app |
| Vercel inspection | https://vercel.com/gregs-projects-98860c8b/fitness-tracker/2tZqnshTDrFR5EDQpgi78dcBNns7 |
| Project / owner | `prj_RocmjxStsTrtmrDaqMddMnb29ENh` / `team_zjdKVgrSBNAYC9gql0Raiocm` |
| Target / state | production / READY |
| Application source | `93539b00bef9109f4221d10c9554cd99a3f5d5fe` |
| Artifact SHA256 | `461e0bf9e21561e0323c6c2edf53e825d48f8a8a8fc7c9f2a739798c8ea44814` |
| Local and rendered hosted build ID | `u93phgwCcXfUdAb5YKaBh` |
| Readback times (UTC) | before `2026-09-24T00:10:09.016Z`; after `2026-09-24T00:12:33.865Z` |
| Framework / runtime | Next.js / Node 24.x |
| Production environment bindings | All 31 unchanged by key, ID, type, update time and branch; all names present in deployment |
| Custom live domain | `www.sociusfit.com` remains `dpl_5kZSaXHLmqPPzsCy6odLJyy99utW` |
| Current production target | Same old deployment, source `f123aa8aa848716e894ea7bec340d693995e4b36` |
| Generated project alias | `fitness-tracker-gregs-projects-98860c8b.vercel.app` now points to the staged deployment |

Vercel assigned the generated project alias automatically despite `--skip-domain`.
Do not describe every URL as unchanged. No manual alias change was made. The
sensitive exercise-preference binding was preserved; its plaintext value and
effective runtime behavior remain unverified. The five newer flags remain absent;
`initialDosePolicy` is still hard-disabled. No private values were exported.

## Artifact and deployment verification

Pinned Vercel CLI 56.4.1 ran on Node 24.13.1 in a separate upload-only container.
The image was prepared before mounting the exact official CLI configuration
directory read-only. The upload directory contained only the retained prebuilt
output and project link. Before upload, the tar digest, project binding, all 939
regular-file hashes/sizes/modes and 183 contained symlink targets were verified.
The command used no environment overrides, public-access flag or rebuild:

```text
vercel deploy --prebuilt --prod --skip-domain --scope gregs-projects-98860c8b
```

The deployment log reports 1,122 downloaded entries, use of existing
`.vercel/output`, and READY in 19 seconds. Source identity is bound through the
verified artifact and upload evidence: this artifact-only deployment has no Git
commit metadata. Subsequent browser checks matched the rendered build ID, nine
script paths and both downloaded CSS/icon hashes to the retained artifact.

Full CI `35935064279` passed on saved preparation checkpoint `b4ef53d`: 3,491
tests passed, 19 skipped, 26 mobile browser journeys, TypeScript, lint and build.
Application source `93539b0` independently passed CI `35930249161`. Later
preparation changes do not alter application/public trees or build inputs.
The documentation checkpoint `8080788` subsequently passed full CI
`35937955529`; this result was read back after the hosted checks.

## Hosted checks after Vercel sign-in

Initial anonymous requests to `/auth/signin` and `/api/coach/weekly` returned
HTTP 302 to Vercel SSO. Greg then signed into Vercel. The existing Chrome session
now reaches the exact staged hostname without changing deployment protection.
No SociusFit login was attempted.

The desktop sign-in page renders with empty login fields and its expected
charcoal/mint styles. Its rendered Next payload contains the exact retained
build ID. All nine script paths present in the DOM exist in the artifact manifest.
The browser's asset export downloaded the observed stylesheet and icon; their
sizes and SHA256 digests match the artifact byte-for-byte. These two hashes do
not constitute a byte comparison of all hosted scripts or functions.

Browser navigation to `/api/coach/weekly` and `/api/coach/intake` returns exactly
`{"error":"Unauthorized"}`. The source branches return HTTP 401 before athlete
queries. The browser interface exposes the rendered body, not raw response
status/headers, so direct transport-status verification is not claimed. No
authenticated athlete flow or `/api/health` call was performed.

At `2026-09-24T00:29:04.197Z`, fresh read-only metadata again confirmed the live
custom domain/current production target remain old and all 31 runtime bindings
are unchanged. See [hosted check receipt](production-hosted-checks-2026-09-23.json).
Do not use standard `vercel curl`: independent review of CLI 56.4.1 confirmed it
can create a protection-bypass token when none exists. No bypass token or
protection configuration was created or changed.

The upload container `socius-stage-upload-93539b0-b` was stopped; readback reports
`exited`, running false. The first startup container remains `created`, running
false. The original tar is retained locally. Startup and diagnostic failures are
recorded in the [investigation](../../../handoffs/investigations/programming-quality-staged-deployment.md).

The bounded staging checks passed. Authenticated behavior and new-schema writes
remain later cutover checks. Production cutover still requires separate approval, following
the [release sequence](production-release-decision-2026-09-23.md#later-cutover-decision-after-staged-evidence-exists).
Do not deploy a duplicate or treat READY alone as permission to migrate/promote.
