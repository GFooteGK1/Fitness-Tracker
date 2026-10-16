# Setup-freshness release checkpoint

Canonical task: `Fitness-Tracker-i40.15`. Date: September 27, 2026.

Draft PR: https://github.com/GFooteGK1/Fitness-Tracker/pull/86
Candidate: `80bef158d7e07f9ff6295b1029eeffa002a1821e`.
Base: `d3c07c59bae4c7b9782460823381e3e82cd793f2`.
GitHub reported the PR draft and mergeable. The release checkout remains clean.
CI: https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/36321466070

## Read-only platform preflight

Greg explicitly approved the prepared GET-only CLI method after the prior
connector's three schema-validation failures. The first revised-method attempt
passed; prior failures were not erased or retried.

- Observed: `2026-09-27T13:10:54.614Z`.
- Project: `prj_RocmjxStsTrtmrDaqMddMnb29ENh`.
- Production deployment: `dpl_2qhiP9izPKLaGzQdcaRSL8fG588n`, READY, main at the
  candidate's recorded base commit.
- `sociusai.vercel.app`, `sociusfit.com` and `www.sociusfit.com` all resolve in
  Vercel metadata to that deployment; redirects are retained in the receipt.
- Thirty-one production binding metadata entries were inspected without value
  decryption; metadata SHA256
  `09b2d242f1943b3056f11380e0b263cb1ef350dc3c1e98b3c11f3f49438fc0da`.
- Receipt in the isolated release checkout:
  `output/setup-freshness-release/platform-93de4960-8591-4de4-aae2-16ded24f5ab4.json`.
- Post-CI refresh also passed at `2026-09-27T13:19:21.080Z`, with the same
  deployment, aliases and metadata digest. Receipt:
  `output/setup-freshness-release/platform-3b9698b8-ec34-42a4-88ee-0676ea30dbea.json`.

This is production platform identity evidence, not source-to-build attestation,
hosted PostgreSQL preflight, runtime smoke evidence or rollout authority. Refresh
time-sensitive observations before any approved rollout. No database query,
write, credential change, deployment or numerical activation was performed.

## CI and remaining gates

Exact-head CI run `36321466070` completed successfully at `2026-09-27T13:18:00Z`:
318 test files passed, seven skipped; 3,578 tests passed, 20 skipped; typecheck,
lint and production build passed; all 26 mobile journeys passed in 4.9 minutes,
with zero configured retries. Run/head identity and full log are saved under
the isolated release checkout's `output/setup-freshness-release/` directory.
The database schema/ledger, predecessor definitions/ACLs, current pause generation
and accepted-history digests still require a fresh authenticated read-only check.
After that, the coordinated release still requires concrete target-specific
approval. Preserve the completed prior cutover and disabled numerical policy.

## Broader programming work

P0 review resumed. Greg reaffirmed the settled higher starting bodyweight-volume
principle unless athlete evidence supports lower tolerance. Record the original
baseline as needing correction and do not repeat this principle for a numeric
label. Exact response is in `development-review-decisions.md`; no complete rubric
scores were inferred. JEV labels/provider token evidence and
the remaining P0-P6 gates stay open. At handoff, board I40-15 is blocked on
database preflight/access and release approval; I40-1 needs remaining review.
The resumed run's PR/CI, platform and coaching-rule checkpoints were delivered
and read back. No remaining programming package was closed by this checkpoint.
