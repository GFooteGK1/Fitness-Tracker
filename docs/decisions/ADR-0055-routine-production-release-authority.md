# ADR-0055 - Routine production release authority

- **Status:** Accepted
- **Date:** 2026-11-27
- **Operative rule:** [SociusFit repository instructions](../../AGENTS.md#routine-production-releases)

## Context

The shared card changes in [PR #177](https://github.com/GFooteGK1/Fitness-Tracker/pull/177) passed local checks but only entered the release pipeline after Greg directed a release. Once the authorized session merged the PR, Vercel deployed from `main`. Greg approved standing authority for Codex to complete routine releases when checks pass and a usable fallback is ready.

## Decision

Use the existing protected GitHub pull request and Git-triggered Vercel deployment path. Codex owns the full release for routine, Greg-directed changes within the repository rule. The global production guardrails govern any action outside that grant.

For PR CI, GitHub may test a temporary merge commit. Match successful CI evidence to the current PR head and base and match the Vercel Preview to the PR head. Verify the resulting production commit and the expected source tree.

Record the last known-good production deployment ID and Git commit before merging. Confirm the canonical domain serves it, check baseline health, and verify Vercel marks it eligible for rollback. Assess compatibility with persisted data, external integrations, and cached client metadata when the release touches those surfaces. For an incompatible fallback, hold the routine release until a safe fallback is verified or Greg approves a different release procedure.

## Alternatives considered

- **Per-release approval.** Retains a decision on each release and adds a handoff even to routine changes that pass all checks.
- **GitHub native auto-merge.** Can merge after required GitHub checks. SociusFit’s current branch protection requires the `verify` job, while Codex verifies the exact Vercel Preview and usable fallback. Automating the merge in GitHub would require preserving those gates there.

## Consequences

- A Vercel Instant Rollback restores traffic to an existing deployment. It leaves Git history and persisted data as they were and pauses automatic assignment of production domains until a deployment is deliberately promoted. After verifying recovery, record the production and `main` divergence. Obtain separate approval for re-promotion or a recovery that extends beyond the approved application rollback. [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback#undo-a-rollback)
- If production domain assignment is paused, hold the next routine merge until authorized recovery restores it. Use the separate migration procedure for database recovery or any merge that could trigger production database work.
