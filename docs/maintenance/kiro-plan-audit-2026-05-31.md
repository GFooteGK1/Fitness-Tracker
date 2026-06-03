# Kiro Plan Audit - 2026-05-31

## Purpose

This audit reconciles the historical `.kiro/specs` planning tree with the current SociusFit codebase. The Kiro tree is useful project history, but it is no longer the active delivery source of truth. Current work should use `AGENTS.md`, `HANDOFF.md`, `docs/architecture/ARCHITECTURE-MAP.md`, migrations in `docs/migrations`, and maintained tests under `test/`.

## Current Verdict

Most early Kiro plans have been completed or superseded by maintained implementation and tests. The tree should be preserved as historical planning context, not deleted. Do not treat unchecked Kiro boxes as automatic backlog unless this audit identifies them as active maintainability work.

## Spec Status Summary

| Kiro spec | Checkbox status | Current status | Evidence / action |
| --- | ---: | --- | --- |
| `agent-system` | 12 complete, 0 open | Complete, extended | Agent modules, unified endpoint, V2 UI, tests, and the new Manager/Socius programming-context work now extend this plan. Current files include `app/lib/agents/*`, `app/api/agent/process/route.ts`, `app/api/agent/context/route.ts`, `test/agents/*`, and `test/api/agent-process-manager.test.ts`. |
| `authentication` | 0 complete, 62 open | Superseded by implementation and `authentication-fixes` | The early checklist was never backfilled, but auth exists in `app/lib/auth/*`, `app/api/auth/*`, `app/auth/*`, profile components, and auth tests. Do not use this unchecked plan as active backlog without re-reviewing against current product behavior. |
| `authentication-fixes` | 31 complete, 0 open | Complete | Cookie manager, session cleanup/sync, OAuth state, error logging, UI updates, and auth regression tests exist in `app/lib/auth/*` and `test/auth/*`. |
| `classifier-meal-detection-fix` | 4 complete, 0 open | Complete | Classifier logic and preservation tests exist in `app/lib/agents/classifier.ts`, classifier prompts, and classifier tests. |
| `dynamic-sheet-tab-detection` | 11 complete, 0 open | Complete | Maintained in `app/lib/sheets/*` with unit/property/e2e tests under `test/sheets/*`. |
| `food-tracking` | 10 complete, 1 optional open | Complete for product, optional schema PBT not promoted | Food tracking implementation, components, routes, storage, targets, adherence, and food tests exist. The one open item is an optional schema-validation property test; promote only if it covers a current risk. |
| `holistic-query-system` | 10 complete, 0 open | Complete, now overlapped by agent context | Query route, intent classification, domain fetchers, response generator, query tests, and the new programming-context path cover this area. |
| `production-testing-strategy` | no tasks file | Guidance only | Keep as historical testing guidance. Active gates are TypeScript, Next build, focused Vitest suites, and a future lint policy pass. |
| `timezone-standardization` | 4 complete, 23 unchecked including 11 optional | Partially complete; active maintainability item | Core utilities and many app paths are implemented, and `AGENTS.md` now documents timezone rules. Remaining work is not a single feature blocker, but timezone consistency remains a live maintainability risk. Use the maintainability checklist below. |
| `trainer-parsing-error-handling` | 9 complete, 0 open | Partially promoted into maintained gates | Shared error handling is wired into Trainer, Nutritionist, and Socius parsers. Focused parser/error regressions now compile and run under the maintained gate. Broader generated preservation/integration suites remain quarantined until rewritten against current contracts. |
| `upgrade-to-haiku-4-5` | 1 complete, 6 open | Stale / not current delivery direction | Only the classifier currently uses `claude-haiku-4-5-20251001`; main agents and legacy routes still use Sonnet-family models. Treat this plan as archived research until a model migration is intentionally reopened. |
| `weekly-progress-tracking` | 10 complete, 0 open | Complete | Weekly adherence API and UI components exist with calculator/component/API tests. |
| `whoop-integration` | 16 complete, 0 open | Complete | WHOOP OAuth, token handling, sync, dashboard/settings, cross-domain insights, docs, and tests exist. |
| `whoop-v2-schema-fix` | 20 complete, 0 open | Complete | WHOOP validation/types/sync transformations/migration docs/tests are present. Recent stabilization repaired TypeScript compatibility around current snake_case/camelCase usage. |

## Maintainability Items To Carry Forward

1. Kiro is archive, not backlog.
   - Preserve `.kiro/specs` and `.kiro/steering` for historical context.
   - New work should start from current docs, current tests, and live code inspection.
   - If a Kiro plan looks relevant, confirm it against source and tests before implementing unchecked boxes.

2. Promote or retire generated tests deliberately.
   - Promoted on 2026-05-31:
     - `test/agents/error-handling.test.ts`
     - `test/agents/parse-functions.test.ts`
     - `test/agents/trainer-error-handling.test.ts`
     - `test/agents/nutritionist-error-handling.test.ts`
     - `test/api/agent-process-error-handling.test.ts`
   - Current TypeScript still excludes generated/experimental suites:
     - `test/upgrade-haiku-4-5`
     - `test/agents/error-handling-preservation.property.test.ts`
     - `test/agents/integration.test.ts`
     - `test/agents/preservation.test.ts`
   - For each remaining excluded suite, either update it to current contracts and include it in the gate, or remove it after confirming equivalent maintained coverage exists.

3. Finish timezone hardening as a maintenance pass.
   - `app/lib/timezone-utils.ts` is the standard utility.
   - Keep the two offset conventions explicit:
     - API/raw convention: `getTimezoneOffset()`; positive west of UTC.
     - Agent convention: negated; local time equals UTC plus `tz_offset`.
   - Audit remaining local-date risks found in app code:
     - `app/components/ExportDialog.tsx`
     - `app/lib/export-utils.ts`
     - display-only `toLocaleDateString` calls are lower risk, but should stay out of query boundary logic.
   - Reconcile the offset convention mismatch in `app/v2/page.tsx` when calling `/api/meals/daily`; API routes expect raw `getTimezoneOffset()`, while agent calls use negated `tz_offset`.

4. Keep the current programming-context data path as the maintained agent context pattern.
   - Database-side compact context belongs in SQL views/functions, not large prompt fetches.
   - Current migration source is `docs/migrations/agent-context-views.sql`.
   - Runtime fetcher is `app/lib/agents/programming-context.ts`.
   - Socius context assembly is `app/lib/agents/context-builder.ts` and `app/lib/agents/prompts/socius.ts`.

5. Delivery gates for this feature line.
   - Required before merging substantial agent/data-context work:
     - `node node_modules\typescript\bin\tsc --noEmit --pretty false`
     - `npm.cmd run build`
     - Focused Vitest suites covering changed domains.
   - Current known gap: `next.config.ts` still has `eslint.ignoreDuringBuilds: true`. Remove it only after a lint repair pass.

6. Model migration is separate phase work.
   - Do not continue the stale Haiku 4.5 plan opportunistically.
   - If model migration is reopened, create a fresh ADR or plan that evaluates current model availability, quality, cost, and regression coverage.

## Delivery-Practice Alignment

- Source of truth: current repo code, current SQL migrations, `HANDOFF.md`, and maintained tests.
- Architecture updates: update `docs/architecture/ARCHITECTURE-MAP.md` when module responsibilities or data boundaries materially change.
- Decisions: add an ADR before adopting new retrieval infrastructure such as vector stores, semantic search, or a research-paper ingestion system.
- Database changes: keep SQL migrations in `docs/migrations`, apply manually or through the agreed Supabase path, and document verification.
- Test policy: generated tests are not maintainable until they compile cleanly, use current contracts, and are part of a named gate.
