# Programming-quality batch: source integration and production closeout

Prepared September 26, 2026. Status: approved by Greg; execution in progress.
Beads task `Fitness-Tracker-i40.14` is authoritative for status. This document
defines the execution contract. Independent plan review found no material gaps.

## Recommendation

Integrate the completed batch through draft PR #84, after exact-candidate CI and
independent review. Treat the merge to `main` as a production action because
Vercel is linked to that branch. Preserve the completed database cutover and
keep numerical `initialDosePolicy` disabled. Complexity: 3 (operational).

Confidence is high in this release path. Fresh deployment and database readbacks
are still required before execution; the September 25 receipt is historical proof.

## Verified starting point

- Local branch `codex/programming-quality` is clean at `6c833e5`, one commit ahead
  of its remote. Its 17 changed files are local rehearsal tooling, tests and docs.
- PR #84 is open, draft and mergeable. Its remote head is
  `0b012bae7ab2d75e5ddb67e19c1ca18136191c2f`; CI run `36138184715` succeeded.
  That run does not cover `6c833e5`.
- GitHub `main` is `f123aa8aa848716e894ea7bec340d693995e4b36`, an ancestor of
  this branch. No current main reconciliation is needed. Recheck before merge.
- Vercel project `prj_RocmjxStsTrtmrDaqMddMnb29ENh` (`fitness-tracker`) is
  GitHub-linked with production branch `main`, Next.js and Node 24.x. Its current
  production target is READY at `dpl_2tZqnshTDrFR5EDQpgi78dcBNns7`.
  The selected API response contains no custom ignore-build command. This is
  enough to treat merge as potentially deploying; it is not proof of all hook settings.
- The September 25 attended receipt pins that deployment to app source
  `93539b00bef9109f4221d10c9554cd99a3f5d5fe`, with coaching writes resumed.
  All `app`, public assets, package/dependency and deployment config paths remain
  unchanged from that source. Subsequent files are release tools/evidence plus
  migration byte preservation. The revision SQL diff disappears with
  `--ignore-space-at-eol`; exact file hashes match the approved receipt:
  revision `0a2983e79dfbfc7dada724d3af80916b74b61f50e4e0ee32056e5b7dd694f58f`,
  pause `6c336015b78142da07a091d9f999d7019c13d9ec819064cfd4b82ee16d48a041`.
- Canonical Beads i40.11 (cutover), i40.12 (profile rehearsal) and i40.13
  (durable local Podman startup) are closed. The broader i40 epic is incomplete.

The merge contains the full accumulated branch, not only the latest 17 files.
Its application behavior was already released; integration restores alignment
between `main`, the reviewed source and production history.

## Options considered

| Approach | Benefit | Cost and failure mode | Decision |
| --- | --- | --- | --- |
| Fortress: retain the pinned deployment and leave PR draft until all P0-P6 work finishes | No immediate release event | Extends main/production divergence and couples completed work to unqualified future features | Reject for this completed batch |
| Avant-Garde: extract the latest tooling into a separate PR | Small new diff and fast tooling review | Leaves already deployed runtime source unmerged; adds branch reconciliation and split ownership | Use only if the full PR reveals an unresolved release blocker |
| Synthesizer: verify and merge PR #84, retaining compatible rollback | Integrates the deployed behavior and local fixes through one reviewed history | A merge can rebuild/promote automatically; requires pre-merge release gates and post-merge readback | Recommended |

No dependency upgrades, new architecture or database migration is needed.
Greg owns release authority; the executing agent owns evidence collection and
handoff. Independent review checks the complete PR and its compatibility boundary.

## Ordered execution and acceptance

1. **Freeze the batch and release contract.** Update PR text to mark i40.12/13
   complete, distinguish deployed runtime from new local tooling, and link this
   plan and existing results. Refresh main/head identities and inspect the full
   diff. Preserve unrelated work. If main advances, integrate it without rewriting
   shared history, inspect the resulting runtime delta and repeat affected gates.
   Save the plan/handoff as a scoped documentation commit when authorized.
   Acceptance: one named final candidate SHA, truthful scope and no private artifacts.

2. **Publish and verify the candidate.** Push only `codex/programming-quality`.
   Require CI on that exact final SHA: full Vitest (including the seven profile
   ownership tests), TypeScript, lint, production build and 26 existing mobile
   journeys (or the current maintained total). Keep the named Podman VM cold restart
   on Windows/WSL (not a Windows reboot)
   and twelve real local Auth checks as separately identified platform evidence;
   Linux CI does not replace them. Repeat those local checks only if relevant
   inputs change or evidence is invalidated. No synthetic writes through Preview:
   it shares the production Supabase project. Acceptance: green exact-head CI,
   focused local receipts applicable to the candidate, and no unresolved findings.

3. **Complete independent review and read-only release preflight.** Review the
   full diff against current main, with special attention to auth/RLS, revision
   fences, immutable accepted plans and disabled numerical policy. Verify the
   two exact migration hashes/ledger entries and compatible live catalog on
   Supabase `auolnfwetmfcwhtvakzy`; do not reapply either migration. Confirm
   coaching is unpaused, all three production aliases, runtime bindings and the
   compatible deployment target match the retained receipt. Inspect the actual
   Git deployment hooks and production build settings; stop for unexplained drift.
   Preserve access to the current compatible deployment before merge. The old
   unstamped main deployment is not a rollback candidate. Acceptance: review
   cleared, identities reconciled and an executable rollback path recorded.

4. **Merge and observe production.** Once approved gates pass, mark PR #84 ready
   and merge using an allowed repository method without force-push or deleting
   the work branch. Record the resulting main SHA and its CI. Observe the normal
   Vercel Git deployment: require READY, the expected source commit, all intended
   aliases, build identity and expected runtime bindings. A Git rebuild has a new
   build/deployment identity even when app source is unchanged. If no deployment
   is produced, retain the working pinned target, diagnose the hook/ignore reason
   and report source integration separately; do not improvise a manual deployment.

5. **Verify and close this batch.** Use read-only authenticated checks on the
   agreed existing owner with an existing valid session: program and accepted-plan
   reads, and revision compatibility. Confirm relevant routes/assets and review
   post-deploy error logs without exposing user data. Historical create/accept
   smoke remains evidence, not a new live-write claim. No new accounts, plan
   acceptance, pause/resume or synthetic production writes are included. If a
   write probe becomes necessary, prepare its exact scope for separate approval.
   Record deployment/main/CI identities, observed result and limitations, then
   close the integration task and update the handoff. Leave i40 and its unfinished
   programming packages open; resume i40.1/P0 next without repeating the six
   accepted qualitative judgments.

## Recovery and authority

Before merge, any failed gate leaves PR draft and the current production target
in place. After an unhealthy deployment, return aliases only to the verified
compatible `dpl_2tZqnshTDrFR5EDQpgi78dcBNns7` if it is still the preflight-approved
fallback; recheck bindings and health. Do not reverse database migrations,
restore old data, reset local containers or use the older unstamped application.
Unexpected schema/data issues stop this path and require a separately scoped plan.

Greg approved execution of this plan on September 26. This covers the scoped documentation commit,
branch push, PR description/readiness changes, merge to `main`, its normal Vercel
production deployment, read-only validation and conditional rollback to the
verified compatible deployment on the same project/aliases. It does not cover
new migrations, manual redeployment, hosted synthetic writes, new accounts,
numerical activation, paid resources or the unfinished P0-P6 feature work.

No new push, PR mutation, merge or production change was performed during
planning. The subsequent explicit approval authorizes the execution described above.
Private project-board reporting has no SociusFit binding; Beads and the local
handoff retain this plan. Board onboarding is separate from release readiness.

## Evidence

- [PR #84](https://github.com/GFooteGK1/Fitness-Tracker/pull/84)
- [Verified old-checkpoint CI](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/36138184715)
- [Completed cutover](../verification/programming-quality/production-attended-result-2026-09-25.md)
- [Profile rehearsal](../verification/programming-quality/profile-provisioning-rehearsal.md)
- [Durable startup receipt](../verification/programming-quality/durable-rootless-startup-2026-09-26.json)
- [Remaining programming QPlan](coaching-programming-quality.md)
