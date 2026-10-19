# Recovery timing read child 5.1

Baseline: accepted PR96 merge c0febbc717aa404f8872a201350af3d2d7c58eb9. Authorized isolated branch codex/recovery-timing-read. Parent recovery interval-retention task remains in progress and requires a separate schema/ingestion decision; do not close it from this child.

Scope and acceptance: [read plan](../../docs/plans/socius-recovery-timing-read-2026-10-19.md). Pending, non-executable [provider timing decision](../../docs/plans/socius-recovery-provider-timing-decision-2026-10-19.md). No ingestion, schema, backfill, credential, health record, plan, permission, setting or job changes are part of this child.

The candidate preserves existing selected source values while distinguishing storage creation, successful-batch timing and unrecorded measurement timing. Same-day date labels and recent batches cannot establish current readiness. Existing authenticated SELECT-only ownership and stable double-read boundaries remain the release contract.

Release receipts must bind the exact candidate and independent oracle/review, required CI, normal protected merge if permitted, exact Git deployment and actual authenticated context acceptance. Tests or a deployment alone do not close the child or establish athlete outcomes. Existing denied paths remain excluded and unrelated Beads/untracked work remains unstaged.
