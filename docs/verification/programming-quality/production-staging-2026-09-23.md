# Production artifact staged; protected checks pending

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
| Local artifact build ID | `u93phgwCcXfUdAb5YKaBh` |
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
commit metadata. Hosted asset hashes and the hosted build ID have not yet been
read back.

Full CI `35935064279` passed on saved preparation checkpoint `b4ef53d`: 3,491
tests passed, 19 skipped, 26 mobile browser journeys, TypeScript, lint and build.
Application source `93539b0` independently passed CI `35930249161`. Later
preparation changes do not alter application/public trees or build inputs.

## Access limitation and next action

Anonymous requests to `/auth/signin` and `/api/coach/weekly` return HTTP 302 to
Vercel SSO. Chrome also reaches the Vercel login page. These are protection-layer
responses; they do not prove the sign-in page renders or that the application
returns its expected unauthenticated 401. No SociusFit login was attempted.

Greg was asked to sign into Vercel in the retained Chrome tab. Once access exists,
finish static asset/build identity and unauthenticated application checks on the
exact staged hostname. Do not run `/api/health` or authenticated athlete flows as
part of these checks. Do not use standard `vercel curl`: independent review of
CLI 56.4.1 confirmed it can create a protection-bypass token when none exists.
No bypass token or protection configuration was created or changed.

The upload container `socius-stage-upload-93539b0-b` was stopped; readback reports
`exited`, running false. The first startup container remains `created`, running
false. The original tar is retained locally. Startup and diagnostic failures are
recorded in the [investigation](../../../handoffs/investigations/programming-quality-staged-deployment.md).

This is a successful staged deployment with incomplete hosted application
verification. Production cutover still requires separate approval, following
the [release sequence](production-release-decision-2026-09-23.md#later-cutover-decision-after-staged-evidence-exists).
Do not deploy a duplicate or treat READY alone as permission to migrate/promote.
