# Handoff

## Current Feature State

The agent programming-context feature is implemented through the Manager -> Socius path:

- Manager decisions classify programming requests and request expanded cross-domain context.
- Supabase views and the `get_programming_readiness_context` function are documented in `docs/migrations/agent-context-views.sql`.
- `fetchProgrammingReadinessContext` reads compact daily workout, nutrition, recovery, sleep, and strain context from `daily_agent_context`.
- `buildSociusContext` attaches programming context to the Socius prompt.
- Socius now has a read-only `get_programming_readiness` tool and uses the shared agentic tool loop when called with Supabase and `userId`.
- `/api/agent/context` exposes authenticated context inspection for verification.

## Verification

Passing targeted tests:

```bash
npm.cmd test -- test/agents/manager.test.ts test/agents/programming-context.test.ts test/agents/socius-tools.test.ts test/api/agent-process-manager.test.ts test/agents/socius-agent.test.ts
```

Result: 5 files, 33 tests passed.

Production build now passes:

```bash
npm.cmd run build
```

Result: Next.js production build completed successfully and generated all 66 pages/routes.

Full repository TypeScript now passes:

```bash
node node_modules\typescript\bin\tsc --noEmit --pretty false
```

Result: no type errors.

Production build now checks TypeScript again. `next.config.ts` no longer sets `typescript.ignoreBuildErrors`.

Production build now checks ESLint again. `next.config.ts` no longer sets `eslint.ignoreDuringBuilds`.

Additional stabilization tests passing:

```bash
npm.cmd test -- test/auth/cookie-manager.test.ts test/portion-selection.test.ts test/whoop/validation.property.test.ts test/whoop/api-response-parsing.property.test.ts test/whoop/token-refresh.property.test.ts test/v2/InputBar.test.tsx test/food-tracking/integration.test.ts
```

Combined with the feature tests, the latest verification slice passed 12 files and 176 tests.

Known boundary: `test/upgrade-haiku-4-5` remains excluded from the root TypeScript gate because the Haiku 4.5 migration plan is stale/archive work. The previously quarantined agent preservation/integration suites have been updated to current contracts and promoted back into the root TypeScript gate.

## Next Best Step

Current active branch is `fix/workout-gallery-photo-upload`. Next step is to review, commit, push, and open a PR for the workout gallery upload alignment.

Do not reopen `test/upgrade-haiku-4-5` unless model migration is intentionally restarted with a fresh plan.

## Workout Gallery Upload Pass

Completed on 2026-06-04:

- `app/log/page.tsx` now exposes separate Camera and Gallery tiles for workout photo OCR, matching the food logging convention.
- Camera keeps `capture="environment"` for rear-camera capture on mobile.
- Gallery uses an image file picker without the `capture` attribute so an already-taken photo can be selected.
- Both paths feed the existing image compression, preview, and `/api/ocr-workout` analysis flow.

Latest verification:

```bash
node node_modules\typescript\bin\tsc --noEmit --pretty false
npm.cmd run lint
git diff --check
npm.cmd run build
```

Result: all passed. Production build completed successfully and generated all 66 pages/routes.

## Kiro Plan Audit

The `.kiro` tree was audited on 2026-05-31 and should be retained as historical planning context, not deleted. The durable audit is in `docs/maintenance/kiro-plan-audit-2026-05-31.md`.

Key result: most Kiro specs are complete or superseded by current implementation. Active maintainability items are timezone hardening, explicit promotion/retirement of remaining generated tests, lint policy repair, and treating the stale Haiku 4.5 plan as archived until model migration is intentionally reopened.

Promoted on 2026-05-31: focused agent parser/error-handling regressions now compile under the root TypeScript gate and pass in Vitest. Promoted on 2026-06-02: `test/agents/error-handling-preservation.property.test.ts`, `test/agents/integration.test.ts`, and `test/agents/preservation.test.ts` now match current parser/persistence contracts, pass in Vitest, and are included in root TypeScript. Remaining excluded generated suite is `test/upgrade-haiku-4-5`.

Latest verification for the promotion pass:

```bash
npm.cmd test -- test/agents/error-handling.test.ts test/agents/parse-functions.test.ts test/api/agent-process-error-handling.test.ts test/agents/trainer-error-handling.test.ts test/agents/nutritionist-error-handling.test.ts
node node_modules\typescript\bin\tsc --noEmit --pretty false
npm.cmd run build
```

Result: all passed. Lint was enabled during production builds in the later lint policy pass below.

## Lint Policy Pass

Completed on 2026-05-31:

```bash
npm.cmd run lint
node node_modules\typescript\bin\tsc --noEmit --pretty false
npm.cmd run build
```

Result: lint exits 0, standalone TypeScript exits 0, and production build passes with lint and type checking enabled.

Lint warning cleanup completed on 2026-06-02:

- `react-hooks/exhaustive-deps` warnings were fixed with stable callbacks or functional state updates.
- `@next/next/no-img-element` warnings were resolved with local rule exceptions for blob/data preview and user-uploaded photo surfaces where raw `<img>` is intentional.

Latest cleanup verification:

```bash
npm.cmd run lint
node node_modules\typescript\bin\tsc --noEmit --pretty false
npm.cmd test -- test/agents/integration.test.ts test/agents/preservation.test.ts test/agents/error-handling-preservation.property.test.ts
npm.cmd run build
```

Result: all passed. `npm.cmd run lint` reports no ESLint warnings or errors.

## Timezone Hardening Pass

In progress on 2026-06-03:

- `app/v2/page.tsx` now sends raw `getTimezoneOffset()` values to `/api/meals/daily` and keeps the negated convention only for agent `tz_offset` requests.
- `app/components/ExportDialog.tsx` now initializes date inputs with `getLocalDate()` instead of UTC string splitting and passes `tzOffset` to `/api/export`.
- `app/api/export/route.ts` now converts exported meal date ranges with `localDateToUTCStart/End`, validates optional `tzOffset`, and passes the offset into CSV/PDF row grouping.
- `app/lib/export-utils.ts` now derives meal export dates and daily summary grouping through an explicit offset-aware formatter instead of server/runtime UTC dates.
- `app/lib/timezone-utils.ts` now documents the raw `Date#getTimezoneOffset()` sign convention correctly and calculates UTC boundaries using `Date.UTC` so results do not depend on the server runtime timezone.
- `app/query/page.tsx` uses the shared `getTimezoneOffset()` helper.
- `app/program/page.tsx` uses `parseDateString()` for display parsing.

Latest timezone-hardening verification:

```bash
npm.cmd test -- test/timezone-utils.test.ts test/export-utils.test.ts test/export-api.test.ts
node node_modules\typescript\bin\tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run build
```

Result: all passed. Focused test slice: 3 files, 69 tests passed. Production build completed successfully and generated all 66 pages/routes.
