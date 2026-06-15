# Handoff

## Nutrition Loading Review Findings

Completed locally on 2026-06-15 after reviewer follow-up found two remaining loading-state risks.

Findings addressed:

- `DailyProgressView` now wraps `/api/meals/daily` and `/api/targets` reads in bounded client-side fetches. A hung daily nutrition request now exits loading and shows retry UI; a hung targets request is logged as non-blocking and still lets daily nutrition content render.
- `AuthContext.updateProfile()` now clears stale `profileStatus: "error"` and `profileError` after a successful profile update, so a previous profile timeout cannot keep route gates treating the profile as errored after the user saves profile data.

Regression coverage added:

- `test/components/DailyProgressView.test.tsx` verifies daily nutrition timeout retry UI and target-timeout non-blocking render.
- `test/auth/auth-context.test.tsx` now verifies successful `updateProfile()` moves profile state from error back to ready and restores complete onboarding state.

Verification completed:

```bash
npm.cmd test -- test/auth/auth-context.test.tsx test/components/DailyProgressView.test.tsx
npm.cmd test -- test/auth/auth-context.test.tsx test/components/DailyProgressView.test.tsx test/v2/meal-photo-upload.test.tsx test/v2/V2Page.test.tsx
node node_modules\typescript\bin\tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run build
npm.cmd test -- --reporter=dot --silent
```

Results: focused auth/daily-progress tests pass; focused auth/daily/V2 nutrition slice passes 4 files and 17 tests; TypeScript, lint, and production build pass. Full quiet suite exits 0 with 129 files and 1885 tests passed. Production build generated all 66 pages/routes.

Current branch is `main`. Changes are local and uncommitted until Greg asks to commit/push this reviewer-finding patch.

## Nutrition Loading Follow-Up Fix

Completed locally on 2026-06-15 after nutrition still showed an infinite loading state after the first CTA fix.

Root causes found:

- `AuthContext.loading` was still coupled to profile loading. The prior regression only proved a hung `/api/whoop/initialize` request could not block auth; a hung or very slow `user_profiles` lookup could still keep `loading=true` forever for protected nutrition routes.
- `ProtectedRoute requireOnboarding` redirected to onboarding whenever `hasCompletedOnboarding` was false, even if the app could not verify the profile because profile loading had errored or timed out.
- The service worker still served `/food-progress` navigations through a one-day `StaleWhileRevalidate` app-page cache. That could preserve an old nutrition page shell after a deploy, making a pushed fix look like it did not land on mobile/PWA installs.

Implemented cleanup:

- Added explicit `profileStatus` and `profileError` to `AuthContext`.
- Added bounded, request-guarded profile loading. A slow profile lookup now times out after 5 seconds in production, unblocks auth-gated pages, records `profileStatus: "error"`, and still lets a late successful profile response update state if it arrives.
- Updated `ProtectedRoute` so onboarding-required routes only redirect to `/onboarding` after a successful profile read proves onboarding is incomplete. Profile-load errors fail open for authenticated users instead of trapping nutrition behind a spinner.
- Updated sign-in/sign-up redirects to avoid sending already-authenticated users back through setup while profile status is still loading or errored.
- Changed service-worker handling for authenticated app navigations (`/`, `/dashboard`, `/log`, `/food-progress`) to `NetworkOnly` so stale page shells cannot preserve old auth/profile code after deploy.
- Added `test/auth/auth-context.test.tsx` coverage for a never-resolving profile lookup: `/food-progress`-style onboarding-gated content renders after the profile timeout and does not redirect to onboarding.

Verification completed:

```bash
npm.cmd test -- test/auth/auth-context.test.tsx
npm.cmd test -- test/auth/auth-context.test.tsx test/v2/meal-photo-upload.test.tsx test/v2/V2Page.test.tsx
node node_modules\typescript\bin\tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run build
npm.cmd test -- --reporter=dot --silent
git diff --check
```

Results: focused auth/nutrition tests pass; TypeScript, lint, production build, and diff whitespace check pass. Full quiet suite exits 0 with 128 files and 1883 tests passed. Build generated all 66 pages/routes and bundled the updated `/sw.js`.

Current branch is `main`. Changes are local and uncommitted until Greg asks to commit/push this follow-up patch.

## Nutrition CTA Loading Fix

Completed on 2026-06-15 after the "Log nutrition" CTA could navigate to a stuck loading spinner.

Root cause:

- `AuthContext` treated WHOOP connection initialization as part of blocking auth bootstrap. A slow or hung `/api/whoop/initialize` request could keep `loading=true`, so protected routes such as `/food-progress?view=camera` never rendered even though the user session and profile were already enough to show nutrition logging.

Implemented cleanup:

- Moved WHOOP initialization to a background path during startup, session sync, and auth-state changes.
- Added request-id guarding so stale WHOOP initialization results cannot overwrite cleared state after signout or a newer initialization attempt.
- Added `test/auth/auth-context.test.tsx`, which keeps `/api/whoop/initialize` pending forever and verifies auth/profile still become ready.
- Stabilized two full-suite property failures found during verification:
  - `calculateTotalMacros` now sums raw item values and rounds once at the end, avoiding accumulated per-item rounding drift.
  - WHOOP OAuth callback error handling now uses a `Map` lookup so prototype keys such as `__proto__` cannot bypass the fallback error message.

Verification completed:

```bash
npm.cmd test -- test/auth/auth-context.test.tsx
npm.cmd test -- test/v2/meal-photo-upload.test.tsx test/v2/V2Page.test.tsx
npm.cmd test -- test/auth/auth-context.test.tsx test/auth/session-cleanup-service.test.ts test/auth/session-cleanup-service.property.test.ts test/auth/session-initialization.property.test.ts
npm.cmd test -- test/timezone-utils.test.ts test/v2/meal-photo-upload.test.tsx test/api/adherence-weekly.test.ts test/food-tracking/integration.test.ts
npm.cmd test -- test/real-implementation.test.ts test/whoop/oauth-error-handling.property.test.ts
npm.cmd test -- --reporter=dot --silent
npm.cmd run lint
node node_modules\typescript\bin\tsc --noEmit --pretty false
npm.cmd run build
git diff --check
```

Results: full quiet suite exits 0 with 128 files and 1882 tests passed. Lint, TypeScript noEmit, production build, and diff whitespace check all pass. Production build generated all 66 pages/routes.

## Full Test-Suite Restoration / Beads Plan

Completed on 2026-06-15 after the follow-up Beads plan for `Fitness-Tracker-fnk`.

Goal: restore the full repository verification suite after the nutrition/profile cleanup left unrelated failures in WHOOP schema/identifier tests, agent prompt contract tests, and auth session cleanup service tests.

Beads state:

- `Fitness-Tracker-fnk` - Restore full npm test suite: closed.
- `Fitness-Tracker-fnk.1` - Reproduce and classify full-suite failures: closed.
- `Fitness-Tracker-fnk.2` - Repair WHOOP schema and identifier test failures: closed.
- `Fitness-Tracker-fnk.3` - Align agent prompt contract tests: closed.
- `Fitness-Tracker-fnk.4` - Repair auth session cleanup service tests: closed.
- `Fitness-Tracker-fnk.5` - Verify full test suite restoration: closed.

Root causes addressed:

- WHOOP V2 schema and identifier contract drift: UUID-backed sleep/workout identifiers and numeric cycle identifiers needed explicit migration coverage plus display/error wording alignment.
- Agent prompt contract drift: prompt tests were still enforcing stale JSON-only response wording, while the current agents use tool instructions and conversational responses.
- Auth session cleanup test harness incompatibility: tests assigned directly to `global.navigator`, which is read-only in the current runtime.
- V2 page test drift: tests still expected the old tabbed page model and missed current chat-first accessibility and error-handling behavior.
- Sheets retry timer leakage: a property test mocked `setTimeout` in a way that could leak async callbacks into the broader suite.

Implemented cleanup:

- Added `docs/migrations/whoop-v2-schema-fix.sql` with guarded WHOOP V2 identifier checks and conversion guidance.
- Updated WHOOP validation to preserve legacy machine-readable error strings where needed while producing the display wording required by current tests.
- Aligned Socius, Trainer, and Nutritionist prompt tests and prompt text with the current tool-use contract.
- Hardened auth cleanup tests by mocking and restoring `navigator` through `Object.defineProperty`.
- Rebuilt the V2 page tests around the current chat-first UI and added missing accessibility labels, empty state, and server/network error surfacing.
- Fixed agent parser/persistence expectations for current fallback copy and meal timing normalization.
- Stabilized the Google Sheets retry property test by restoring the real timer and using synchronous retry callback execution inside the test mock.

Verification completed:

```bash
npm.cmd test
npm.cmd run lint
node node_modules\typescript\bin\tsc --noEmit --pretty false
npm.cmd run build
git diff --check
```

Results: full `npm.cmd test` exits 0 with 127 files and 1881 tests passed. Lint, TypeScript noEmit, production build, and diff whitespace check all pass. Production build completed successfully and generated all 66 pages/routes. `npm.cmd test` still prints existing property-test diagnostic log noise, but the command exits 0 and the final Vitest summary is green.

Current branch is `main`. Changes are intentionally left uncommitted for review unless Greg asks to commit/push this Beads restoration pass.

## Nutrition Logging / Repeated Onboarding Review

Completed on 2026-06-15 after a team-style review of the nutrition, onboarding, and cross-flow state paths.

Root causes found:

- The repeated profile setup flow was caused by stale `AuthContext.profile` state. Onboarding saved to `/api/profile/onboarding`, but the client did not refresh the profile before computing `hasCompletedOnboarding`; sign-in/session-change handling also allowed `loading` to clear before profile fetch completed.
- Mobile/PWA installs could resurrect stale profile, target, meal, and adherence API responses because the service worker cached all `/api/*` GETs with a one-day NetworkFirst fallback.
- Nutrition capture paths had drifted: selected-date meal logging duplicated timestamp construction, the V2 photo path did not send a timestamp, and the V2 photo UI could show success even when upload analysis failed.
- `/api/targets` returns a zero-valued placeholder when no target row exists, but `DailyProgressView` treated any object as configured targets and rendered 0g/0kcal progress instead of the setup prompt.
- Weekly adherence used the server/runtime date for `daysElapsed`, which could be wrong near midnight for users whose local calendar date differed from the server date.
- Meal upload routes created the Anthropic client at module load and logged API key metadata. That made configuration behavior brittle and exposed unnecessary key diagnostics in logs.

Implemented cleanup:

- Added `refreshProfile()` to `AuthContext`, awaited profile fetches during auth/session changes, and refreshed profile state immediately after onboarding completion.
- Prevented the profile settings page from mounting body-metrics forms before the existing profile is loaded, avoiding accidental empty-profile writes.
- Changed the service worker `/api/*` strategy to `NetworkOnly` so authenticated app state does not fall back to stale cached API responses.
- Added shared `getMealTimestamp()` and used it from camera capture, text meal entry, and V2 photo upload.
- Made V2 photo upload send `timestamp`, surface server error text, and treat failed analysis as a failed upload instead of success.
- Added lazy `getAnthropicClient()` construction and removed API-key metadata logging from meal upload.
- Made `DailyProgressView` render targets only when all target values are positive.
- Made weekly adherence GET and POST derive "today" and week start from the caller's explicit timezone offset.
- Updated one stale trainer-agent malformed-JSON test expectation to match the current parser contract used by the rest of the agent tests.

Verification completed:

```bash
npm.cmd test -- test/timezone-utils.test.ts test/v2/meal-photo-upload.test.tsx test/api/adherence-weekly.test.ts test/food-tracking/integration.test.ts
node node_modules\typescript\bin\tsc --noEmit --pretty false
npm.cmd run lint
git diff --check
npm.cmd run build
npm.cmd test -- test/agents/trainer-agent.test.ts
```

Results: focused nutrition/date/API suite passed 4 files and 87 tests; trainer-agent file passed 43 tests; TypeScript, lint, diff check, and production build passed. Production build completed successfully and generated all 66 pages/routes.

Follow-up test-suite maintenance is now complete in the `Fitness-Tracker-fnk` Beads epic above; full `npm.cmd test` is green.

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

Current active branch is `main`. Next step is to review, commit, and push the single-CTA capture consolidation if accepted.

Do not reopen `test/upgrade-haiku-4-5` unless model migration is intentionally restarted with a fresh plan.

## Capture CTA Consolidation

Completed on 2026-06-04:

- `app/log/page.tsx` and `app/food-log/page.tsx` now expose one `Capture` tile instead of separate Camera and Gallery tiles.
- `Capture` uses the existing gallery/file-picker path without the `capture` attribute, allowing the browser or mobile OS to offer camera, photo library, or files as available.
- The old camera-specific handlers were removed from both pages.
- The workout path still feeds the existing image compression, preview, and `/api/ocr-workout` analysis flow.
- The food path still feeds the existing image compression, preview, and meal upload analysis flow.

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
