# ADR-0028 - Database-enforced coaching write pause

- **Status:** Accepted for local implementation and rehearsal; production installation is not authorized
- **Date:** 2026-09-23
- **Deciders:** Greg's approved release preparation scope, implemented by Codex

## Context

The context-revision migration rejects old unstamped coaching writers. A coordinated cutover needs an enforceable pause and drain before that migration. Old browser tabs, alternate application instances and direct Supabase RPC callers cannot be controlled by a new UI flag. Retrying an accepted proposal must preserve immutable accepted state.

## Decision

Use an additive, operator-controlled database gate for coaching outputs. The new migration `20260923010000_coaching_write_pause.sql` is an explicit pre-cutover prerequisite: its later filename does not mean an ordinary chronological migration batch protects the earlier revision migration. Install it separately against the verified old schema, verify it, pause and drain, then apply the revision migration and compatible application cutover. Do not modify already applied migrations.

The six guarded tables are `training_programs`, `training_plan_versions`, `prescribed_sessions`, `adaptation_proposals`, `coach_weekly_reviews`, and `coach_weekly_review_observations`. They contain program selection/activation, immutable plan versions, prescribed work/status, proposal lifecycle, weekly decisions and decision-observation bindings. Initial, legacy/conversion, weekly replacement, review and first acceptance writes all reach these tables. A statement trigger covers INSERT, UPDATE, DELETE and TRUNCATE, including zero-row statements, direct REST/DML and SECURITY DEFINER RPCs. Program-linked workout completion that updates a prescribed session also pauses and rolls back atomically.

Each writer locks the singleton control row FOR SHARE NOWAIT until transaction completion. The operator updates only that row and commits; the exclusive row lock waits for prior guarded writers, providing the drain boundary. PostgreSQL can admit another compatible SHARE holder while the operator waits, so writes may continue before pause COMMIT. Once the operator owns the exclusive row lock, competing writers fail rather than wait while holding application locks. A timeout or failed operator transaction does not establish a pause; sustained contention requires investigation and a controlled retry, not treating dispatch as success. The operator function has a five-second per-lock wait cap; this is an operational bound, not a whole-request SLA. The gate has no lease or automatic expiry. An operator disconnect after commit leaves writes paused. Resume must match the observed generation, so an old operator command cannot reopen a later pause.

Installation takes all six table locks with NOWAIT in one transaction before attaching triggers. A busy target aborts the entire installation; retry only after inspecting contention. This avoids an installation transaction waiting for a writer while holding a subset of its tables. Runtime pause takes no application-table locks, so it does not invert application lock order. New writers use NOWAIT on the gate. Existing writers already holding SHARE can finish all their writes before the operator obtains the exclusive lock. Test these assumptions using independent PostgreSQL sessions and observed blocker PIDs.

The control table has FORCE RLS, no application grants and no application policies. Both helper functions revoke execution from PUBLIC, anon, authenticated and service_role; the operator function is invoker-security. Only the database operator can change the gate. Trigger execution uses its postgres owner; the migration first requires that existing role to have SUPERUSER or BYPASSRLS, because ownership alone cannot bypass FORCE RLS. Hosted prerequisite readback must confirm this; the migration does not grant role privileges. No client-supplied GUC bypass exists. Missing gate state fails closed. Reapplying the migration must retain pause state and generation.

## Consequences

- Reads remain available. A truly read-only accepted/idempotent replay may return its original result during the pause; any path that writes is blocked. Paused writes raise `PT503`; competing lock attempts can raise `55P03`. Direct PostgREST exposes the custom maintenance status, but current coaching RPC branches return their existing generic HTTP 503 response for `PT503`, without a maintenance-specific message. This stage does not claim a maintenance banner or friendly retry flow. The existing context-conflict handling maps supported `55P03` paths to 409. No UI deployment is needed to enforce the pause.
- This is a coaching-output boundary, not a full database backup freeze. Auth, meals, wearable sync, standalone workout capture, source corrections, assessment/intent memories, recommendation refresh bookkeeping and source invalidation records are not directly gated. Operations on them that cascade to a protected output, such as deleting an Auth owner or modifying a prescribed-session linkage, are nevertheless blocked atomically. Current activity amendments append source invalidations rather than rewrite weekly reviews; source changes may invalidate a draft and revision checks still apply. A consistent database backup must use its own snapshot mechanism. PostgreSQL operators can bypass/disable triggers and remain trusted.
- The gate does not cancel old transactions that have only read. Their later protected writes encounter the gate. Pause confirmation means no guarded output transaction can commit new work until resume, not that every connection/request has terminated.
- The compatible application rollback floor still applies. Resuming an incompatible old application after the revision migration is not safe. Do not remove revision guards or restamp historical drafts to simulate rollback.
- Rehearsal and deployment are separate. Local synthetic evidence does not prove production grants, source compatibility, backup restoration or traffic routing. Production installation, pause and cutover require explicit target-specific authorization.

## Alternatives considered

An application/UI flag is easy to expose but leaves stale clients, old instances and direct RPCs writable. A PostgREST hook cannot guard independent SQL or already-running calls.

Revoking table or function privileges requires a complete changing inventory and exact ACL restoration. Existing SECURITY DEFINER/in-flight calls still complicate draining. Role defaults such as read-only transactions do not establish a reliable boundary for pooled existing sessions.

A session-held advisory lock avoids schema state but automatically disappears on operator disconnect. A persistent gate gives an inspectable fail-closed state and controlled recovery. Table locks held throughout deployment can block reads and introduce cross-table deadlocks; the gate is held exclusively only for its small state transition.
