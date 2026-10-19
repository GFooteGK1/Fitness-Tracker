# Approved workout-history deployment

The exact approved reader commit `de3c5efc0395fbf68b2372b830dcfc84aadf97e8` is deployed at `https://www.sociusfit.com`. Promotion completed on October19 at01:25:59UTC. Deployment is separate from merge and actual owner-data acceptance: the code is committed and locally tested/reviewed, merge is paused, and the parent conversation will perform the ordinary owner tool retrieval.

## Release and verification

- Canonical deployment: `dpl_2Z5b2poGbDtsStUFAHrSBaBWJHh5`, READY, production, verified project `prj_RocmjxStsTrtmrDaqMddMnb29ENh`.
- Immutable hostname: `fitness-tracker-kemghd2d1-gregs-projects-98860c8b.vercel.app`.
- Package overlay digest: `69068fcfa496087834008e72361a035e3075232509d7a79170fd850d374ff406`.
- Runtime boundary: exactly one reader changed relative to the prior released connection; the other twelve overlays, shared planning flags/consumers, writers and cron are unchanged. The package's normalized runtime matches the approved Git commit. No roadmap files, credentials, owner records, untracked logs or new test TLS keys were uploaded.
- Local candidate evidence:362 passing regression tests,117 independent checks, no actionable review findings, type checking, focused lint and local production build passed. These are software checks, not evidence of training improvement or hosted record completeness.
- Guarded release: dry upload1680files with no forbidden paths; build compiled/type-validated/completed; seven staged checks passed before promotion. Production ID/source/configuration metadata were rechecked before mutation. Canonical metadata subsequently confirmed the exact candidate and six canonical route checks passed.
- Metadata returned the canonical resource/issuer/email/header contract on the staged immutable hostname. The previously denied canonical metadata endpoint remained excluded; no changed-User-Agent or alternate-path retry occurred. Canonical auth checks returned expected unauthenticated failures; no owner token or athlete data was requested here.
- Rollback reference: prior deployment `dpl_2t5ciggevHsJUaS7jyDKowZqy4aG`, overlay digest `359eb4805106dd282cafa8adff46b62dfbdb1ddcc2116cfd038fbc1054dbd376`. No rollback was needed or performed.

The first route invocation failed before HTTP because CLI56.4.1 forwarded `--scope` to system curl; moving the argument also failed. Installed CLI code confirmed its parser behavior. The established linked-project invocation with exact org/project environment IDs then passed, using unchanged authentication, headers and endpoints. The frozen package and release gates were unchanged. The final helper hash and the distinction from its earlier independent preflight review are in `workout-release-checkpoint-2026-10-19.json`.

## Merge pause and normal CI

Greg authorized normal scoped push/PR/CI/merge after testing. GitHub main remains `107a570339d8c53f7db44dfbc8d77c4c585cff68`; its protected `verify` check is required, strict, and enforced for administrators. No review approval count is required by current protection. No override or force push is authorized or attempted.

Read-only Vercel project inspection found GitHub `GFooteGK1/Fitness-Tracker`, production branch `main`, automatic deployments enabled and no ignore-build command. The project configuration contains none of the four connection settings preserved as per-deployment/build overrides in the guarded release: `SOCIUS_MCP_ENABLED`, `SOCIUS_MCP_ORIGIN`, `SOCIUS_MCP_CLIENT_ID`, `SOCIUS_MCP_REDIRECT_URI`. The current code fails closed unless `SOCIUS_MCP_ENABLED` is `true`. A normal main merge would therefore auto-deploy different connection behavior and could disable the live MCP interface. This is the unexpected deployment effect the authorization explicitly requires pausing. Its outcome is **paused before merge**, not an access denial or uncertain merge.

Do not silently copy settings, enable a global runtime default, disable Git deployments, bypass checks or merge around this finding. Resolve the precise deployment effect before merging. PR and required CI preparation can continue independently. CI only moves its existing Chromium-install step before `npm test`, because the consent Vitest suite launches Chromium; no checks are removed or weakened. CI and PR outcomes are recorded separately when available.

## Remaining acceptance

The parent conversation should make one ordinary `get_coaching_context({days:7,tzOffset:300})` call, reconcile its dated source coverage, and report any gap without changing records or permissions. This deployment does not prove that external workouts were saved or that missing sources are empty. Actual data verification, refresh/revocation qualification and fresh-browser answer rendering remain open. Original repository/session access denials remain respected. No schema, credentials, grant settings, WHOOP reconnection, live records or background jobs were changed.

Evidence: the `workout-release-*-2026-10-19.json` package, dry-check, preflight-review, build-check, staged-routes, staged-discovery, promote-attempt/result, canonical, canonical-routes, merge-effects-inspection and checkpoint receipts in this directory. Raw CLI logs and credential values are not retained in these receipts.
