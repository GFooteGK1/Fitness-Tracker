# Handoff

## Node 24 runtime migration (release authorized)

Prepared on 2026-07-27 from `origin/main` on branch
`codex/node-24-runtime` in the clean worktree
`C:\Users\foote\.codex\worktrees\fitness-tracker-hybrid-dashboard`.

- Migrated the CI action runtime to Node 24-native `actions/checkout@v7` and
  `actions/setup-node@v7`, and changed the CI application runtime from Node 20
  to Node 24.
- Declared `engines.node` as `24.x` so npm and Vercel use the same runtime
  contract, updated onboarding documentation, and aligned `@types/node` plus
  its lockfile dependencies with Node 24.
- Stabilized the existing WHOOP staleness property test by using one captured
  timestamp. Its exact 24-hour case previously depended on whether the clock
  advanced between two `Date.now()` calls and failed once under the full
  verification load.

Verification completed locally on Node 24.13.1:

- `npm ci` reproduced the final lockfile.
- Focused WHOOP verification passed: 1 file / 8 tests.
- Full Vitest passed: 162 files / 2,040 tests, with 5 files / 7 explicitly
  network-gated tests skipped.
- Strict TypeScript with incremental output disabled and lint both passed.
- The placeholder-backed production build passed and generated all 67 routes.
- Final diff/config inspection passed. Hosted proof that the GitHub annotation
  is gone is recorded below.

Hosted verification completed on PR #39 on 2026-07-27:

- The PR CI run passed on commit `863df26` in 1m50s. Checkout, Node setup,
  install, 2,040 tests, strict TypeScript, lint, and production build all
  completed successfully.
- The check-run annotations endpoint returned an empty list. The setup log
  confirms `node-version: 24`, a cached Node 24.18.0 toolchain, and runtime
  `node: v24.18.0`; the former Node 20 deprecation annotation is gone.
- The Vercel preview deployment completed successfully on the same commit.
- Greg explicitly authorized commit and merge. The final gates are the new
  exact-commit CI run after this handoff update, squash merge, main-branch CI,
  and the Vercel production deployment readback.

Team pass: automation-SRE owns the CI/runtime contract; software engineer owns
the scoped configuration and test-stability edits; reviewer and verifier are
handled in the main session because delegation is not permitted. Security
review confirms workflow permissions remain `contents: read`, no secrets or
production configuration were changed, and the action-major update stays
within the existing GitHub-maintained actions. No architecture-map or ADR
update is needed because application boundaries and runtime ownership did not
change.

Bead `Fitness-Tracker-1f9` tracks this migration. Keep it open until the branch
is committed, the PR Actions run passes without the Node 20 annotation, the PR
is merged, and the Vercel production deployment reports ready on Node 24.

## Mobile header overflow fix (release authorized)

Prepared on 2026-07-27 from `origin/main` on branch
`codex/mobile-header-nav` in the clean worktree
`C:\Users\foote\.codex\worktrees\fitness-tracker-hybrid-dashboard`.

- Removed the mobile-only Board and PR shortcuts from the shared header while
  retaining the desktop Leaderboards and PRs links.
- Constrained the six remaining mobile shortcuts to a fixed six-column grid;
  each link can shrink inside its column instead of widening the page.
- Added an accessible label for the mobile shortcut group and regression tests
  for both the mobile and desktop navigation contracts.
- Focused test passed: 1 file / 2 tests. Full Vitest passed: 162 files / 2,040
  tests, with 5 files / 7 network-gated tests skipped. Strict TypeScript, lint,
  and `git diff --check` passed.
- Playwright verified the exact row at a 320x640 viewport. The document and
  viewport widths were both 320px, all six shortcuts were visible in one row,
  and the temporary preview/browser artifacts were removed.

Team pass: frontend lead owned the mobile hierarchy and touch layout; builder,
reviewer, and verifier were handled in the main session because delegation was
not permitted. The React review found no new hook, state, performance, or type
risks; the change adds semantic grouping and preserves the existing link
targets. No architecture-map or ADR update is needed because responsibilities
and boundaries did not change.

Release was authorized on 2026-07-27. Publish through the repository PR and
Vercel Git integration; close bead `Fitness-Tracker-00k` only after main CI, the
production deployment, and a signed-in 320px mobile canary pass. GitHub,
Vercel, and Beads are the authoritative post-commit status surfaces.

## Hybrid on-demand dashboard (released and live-verified)

The initial implementation was merged through PR #34 as `36dc261`. Runtime
hardening was merged through PR #35 as `04cf15f` after a signed-in production
canary exposed the graceful-degradation path described below. Both releases
deployed to the `gfootegk1` personal Vercel project on 2026-07-27. The production
Supabase migration was applied twice and independently verified before release.

Implemented locally:

- Preserved the existing dashboard cards as the immediate and authoritative
  numeric surface. `DashboardNarrative` mounts only after those deterministic
  dashboard facts are available and cannot block or replace them.
- Added authenticated `/api/dashboard-narrative`. It gets a versioned dashboard
  template, compact 7-day cross-domain context plus recent PRs, and calls the
  provider-neutral `complete()` seam with purpose `query` for strict JSON.
- Added a compute-vs-compose guard: prompt strings are treated as untrusted data,
  output is bounded to headline/summary/three section-tagged highlights, and any
  numeral or spelled-out number not present in the app-computed facts is rejected.
- Added `view-compositions-migration.sql` for a private Supabase cache keyed by
  user, local day, template version/content fingerprint, and facts fingerprint.
  A relevant new workout, meal, recovery sync, target change, or PR changes the
  fingerprint and logically invalidates the previous composition without
  coupling every write route to cache deletion.
- Added loading, cached, empty/disabled, provider-unavailable, and retry states.
  Provider/cache failure explicitly leaves the numeric dashboard current and
  usable.

Verification completed locally on 2026-07-27:

- Focused verification: 6 test files and 23 tests passed.
- Full Vitest suite passed: 161 files and 2,034 tests passed; 5 files and 7
  explicitly network-gated tests skipped.
- Strict TypeScript passed with incremental output disabled (the sandbox blocked
  writing `tsconfig.tsbuildinfo`; this was not a type error).
- `next lint` passed with zero warnings/errors. Its only notice is the upstream
  Next 15 deprecation of `next lint` ahead of Next 16.
- Production build passed on Next 15.5.22 and generated 67 routes, including
  `/api/dashboard-narrative`.
- Playwright CLI verified the composed card in a real browser at 1440x1000 and
  390x844. Highlights remained a three-column desktop grid and stacked cleanly
  on mobile; deterministic cards stayed visible beneath the narrative. Temporary
  preview, screenshots, browser state, server logs, and processes were removed.
- `git diff --check` passed after the final documentation pass.

Production canary and runtime correction on 2026-07-27:

- GitHub CI passed on `36dc261`, and Vercel marked the production deployment
  ready under `gregs-projects-98860c8b/fitness-tracker`. Anonymous route probing
  returned the expected 401 from `/api/dashboard-narrative`.
- The signed-in dashboard rendered current WHOOP, PR, and workout numbers while
  the narrative card correctly fell back to `Today's read is unavailable`.
- Vercel runtime logs showed two Anthropic `query` calls ending at exactly the
  500-token ceiling, followed by `LLM returned an invalid dashboard narrative`.
  The neutral seam also promised Anthropic JSON-schema prompting but did not
  include the schema in the provider request.
- Runtime hardening now appends the requested JSON schema to Anthropic's system
  prompt, raises this bounded narrative budget to 800 tokens, reports
  `max_tokens` distinctly, and treats digits embedded in canonical fact strings
  as valid provenance while still rejecting invented numbers.
- Regression tests failed on all three mismatches before the fix and pass after
  it. The full suite passes at 161 files / 2,038 tests, with 5 files / 7
  explicitly network-gated tests skipped. Strict TypeScript and lint pass.
- A build without the required public Supabase variables failed at the known
  auth-page prerender gate. The placeholder-backed rerun produced a complete
  `.next` build tree but did not exit before the 180-second local timeout, so
  GitHub CI remains the authoritative hotfix build gate.
- PR #35 merged to `main` as `04cf15f`. The authoritative main-branch CI run
  passed tests, strict TypeScript, lint, and production build in 1m59s, and the
  corresponding Vercel production deployment reported success.
- A signed-in production canary returned 200 and rendered the narrative above
  the still-visible deterministic cards. Its Anthropic `query` call used 376
  output tokens within the new 800-token budget; a repeat request returned the
  cached composition with 200 in 456ms and no second LLM call.

Team pass: frontend lead owned hierarchy, responsive states, and graceful
degradation; architect owned cache identity and the compute-vs-compose boundary;
builder work was done in the main session; reviewer caught and fixed the
same-version template cache collision plus spelled-number provenance gap;
Vitest, TypeScript, lint, build, and Playwright supplied verification. Separate
subagents were intentionally skipped because the session instructions prohibited
delegation unless Greg explicitly requested it.

Explicit release gates and known scope:

- `docs/migrations/view-compositions-migration.sql` was applied twice in
  production and passed rollback-only structural, grant, and two-user RLS
  verification. See
  `docs/migrations/view-compositions-production-application-2026-07-27.md`.
- The narrative arrives asynchronously as one validated composition through the
  existing non-streaming LLM seam. The page progressively renders numbers first,
  but this slice does not add token-level provider streaming.
- The compact narrative facts currently cover workouts, nutrition, recovery, and
  recent PRs. The existing leaderboard card remains deterministic; leaderboard
  narrative is omitted until a compact rank aggregate is available.
- `Fitness-Tracker-ti3.3` may be closed: the migration, GitHub CI, Vercel
  deployment, signed-in production narrative, and cached repeat request all
  passed. Token-level streaming and leaderboard narrative remain follow-on
  scope rather than release blockers for this hybrid-render slice.

## Autonomous reliability and ADR-0001 foundation

Release authorized on 2026-07-26 from the clean worktree
`C:\Users\foote\.codex\worktrees\fitness-tracker-autonomous`, branch
`codex/autonomous-queue`. Git history and Vercel are the authoritative surfaces
for commit and deployment status. The two SQL migrations in this tranche were
applied and verified in production on 2026-07-26. Older sections below are
historical records.

Implemented locally:

- Rebuilt the personal-records migration as an idempotent, transactional,
  least-privilege RLS migration and hardened `/api/pr-history` query/error
  handling. Apply-twice and cross-user RLS proof now pass on a deleted
  disposable Supabase project and in production.
- Added CI for tests, strict TypeScript, lint, and build; fixed the
  `photo-lifecycle` property generator; and accepted only compatible lockfile
  audit patches. Forced dependency downgrades/upgrades were not taken.
- Fixed agent tool-call continuation so it uses the provider that produced the
  first result, rather than the process-default provider.
- Made food-photo nutrition explicitly an estimate in the review flow, removed
  false photo-storage language, and ensured name-only review edits persist.
- Extracted deterministic dashboard workout aggregates into
  `app/lib/aggregates/dashboard.ts`; the app still computes every displayed
  number. The stats route now uses private/no-store caching.
- Added the strict versioned view-template contract, authenticated immutable
  version API, and RLS migration for ADR-0001. Templates control only section
  visibility/order and narrative tone; they cannot supply fitness values or
  executable prompt text.
- Refreshed provider, photo-retention, eval, environment, and architecture docs.

Verification completed on 2026-07-26:

- `npm ci` reproduces the final lockfile; Serwist resolved to patched `9.5.12`.
- Changed-surface slice: 13 files and 167 tests pass.
- Full suite passed twice: 154 files and 2,006 tests passed; 5 files and 7
  explicitly network-gated tests skipped on each run.
- Strict TypeScript, lint (zero warnings/errors), and `git diff --check` pass.
- Production build passes on Next 15.5.22 and generates all 66 routes,
  including `/api/view-templates/[viewType]`.
- Playwright verified the photo-estimate review and item-edit states at desktop
  and 390px mobile widths; the temporary visual harness was removed afterward.
- Production audit was reduced from 9 high findings to 3. The remainder are
  Next-bundled PostCSS/sharp advisories; npm proposes an unsafe Next 9 downgrade,
  so no forced fix was taken.
- CodeRabbit review was attempted but could not run: its CLI was absent and the
  installer was rejected as an unauthorized persistent machine change. No
  manual review is represented as CodeRabbit output.
- A read-only production Supabase preflight confirmed the intended project
  (`fitness-tracker`, ref `auolnfwetmfcwhtvakzy`) is PostgreSQL 17.6, has five
  auth users and 154 workouts, and at preflight time did not have
  `personal_records` or `view_templates`. No write was made during preflight.
- Supabase preview branches are unavailable on the current Free plan. The UI
  requires a Pro upgrade and quoted branch compute at $0.01344/hour; no plan or
  resource change was made. Supabase's current Free plan permits two active
  projects, so Greg approved a temporary second project for verification.
- Added `docs/migrations/verify-autonomous-queue-migrations.sql`. After both
  migrations are applied twice, it checks structure/grants and exercises
  cross-user RLS using two auth identities inside a transaction that always
  rolls its fixtures back.
- Created `fitness-tracker-migration-test` (PostgreSQL 17.6, automatic table
  exposure disabled), seeded only two synthetic auth rows and the minimum
  `workouts` prerequisite, and applied each migration twice successfully. The
  RLS verifier passed. Independent readback showed 0 PR fixture rows, 1 default
  template, 0 user-template fixtures, forced RLS on both tables, all 5 policies,
  and correct least-privilege grants. Security Advisor reported 0 errors and
  only the unrelated fresh-project leaked-password warning.
- Permanently deleted the disposable project after verification. Supabase
  confirmed deletion, and the organization readback showed only the production
  `fitness-tracker` project. Durable evidence is in
  `docs/migrations/autonomous-queue-verification-2026-07-26.md`.
- Applied `personal-records-migration.sql` and `view-templates-migration.sql` to
  production once after explicit approval. The rollback-only two-user verifier
  passed. Independent readback found 0 personal-record rows, 1 default template,
  0 user-template rows, forced RLS on both tables, all 5 policies, correct grants,
  and the expected default schema/sections. Existing auth-user and workout counts
  remained 5 and 154. Evidence is in
  `docs/migrations/production-migration-application-2026-07-26.md`.
- Reran the production Security Advisor after application. Its baseline remained
  3 errors and 4 warnings, with no new migration-related finding.
- The production Security Advisor baseline has three existing RLS-disabled
  backup-table errors and four warnings involving a mutable function
  `search_path`, broad execution of `set_user_id()`, and leaked-password
  protection. These predate and are separate from these migrations; they
  are tracked in `Fitness-Tracker-k50`.

Team pass: lead/product-architecture and builder were handled in the main
session; the reviewer pass separately checked the migration contract, durable
diff, and post-run database state; Vitest, TypeScript, lint, build, audit,
Playwright, live SQL readback, and Security Advisor supplied verification.
Independent reviewer automation is the explicit skip above.

Explicit gates that remain:

- No additional product approval is required for this tranche; release completion
  must be verified from GitHub and Vercel rather than inferred from this file.
- Meal-photo persistence remains a product/privacy/cost decision; photos are
  still analyzed in-request and discarded.
- Hybrid AI dashboard narrative work may now build on the verified template
  table, but its local API/foundation has not been shipped.

---

## OpenAI Provider Migration + Eval Harness

Completed and LIVE-validated 2026-07-20. All work on `origin/main`.

**What:** migrated the app off Anthropic-only onto a provider-neutral LLM seam
(`app/lib/llm/`) that supports **Anthropic and OpenAI**, selected at runtime by
`LLM_PROVIDER` (default `anthropic`) with per-purpose model overrides
(`LLM_<PROVIDER>_<PURPOSE>_MODEL`). Every call site (text, vision, query, the
agent loop + 3 agents) goes through `complete()`; the legacy `anthropic-client.ts`
was removed; `@anthropic-ai/sdk` is now imported only by `providers/anthropic.ts`.

**Status:** complete and verified. Full suite **1,934 tests** green; a dual-adapter
contract suite proves both providers normalize identically; and a **live smoke
test against real OpenAI passed** — `gpt-5.4-nano` structured extraction and
`gpt-5.6-terra` tool-call round-trip both work. Behavior on Anthropic is unchanged.

**To flip to OpenAI:** set `LLM_PROVIDER=openai` + `OPENAI_API_KEY` (override a
single purpose's model via e.g. `LLM_OPENAI_VISION_MODEL`). For an **incremental**
flip, use per-purpose provider overrides — `LLM_<PURPOSE>_PROVIDER` beats the
global `LLM_PROVIDER` — e.g. `LLM_NUTRITION_PROVIDER=openai` moves just nutrition
to OpenAI while everything else (incl. vision) stays on Anthropic. Recommended
path: flip cheap text purposes first; keep accuracy-critical vision on Anthropic
until the Phase 4 evals pick per-task models.

**Eval harness (`scripts/eval/`, recipes in its README):**
- Nutrition5k accuracy layer — turnkey once the dataset is pulled (gsutil → `build-manifest` → `run-eval`); needs no production data.
- Supabase consistency layer — code done, but blocked (see findings).
- Pure scoring unit-tested; live/pull runners are env-gated (skip in CI).

**Bugs found + fixed en route:** GPT-5.x reasoning models reject `temperature`
(provider no longer sends it); WHOOP cron + photo cleanup were silent no-ops
(service-role client); `/api/ocr-workout` was unauthenticated; `meals/refine`
could zero a meal's macros on a bad parse; SSRF guard on `meals/analyze`.

**Key findings for the next steps:**
- **The app never persists meal photos** — `uploadMealPhoto` has no callers and
  every insert sets `photo_url: null`. So the Supabase consistency pull and
  in-app labeling both require a photo-persistence change first (bead `196.5`).
- `meals/analyze` is dead code (`queueMealAnalysis` uncalled).
- The workout-photo OCR→parse flow has a deliberate user-review step — don't
  collapse it (bead `dr8.5`).

**Open — needs Greg:** accuracy-escalation thresholds (`xml.3`); persist-photos
product decision (`196.5`); download Nutrition5k + run the eval (`196.3`).
Optional Phase 6: shared rate limiter (`dr8.1`, needs KV/Upstash decision).

---

## Nutrition Anthropic Model 404 Fix

Completed on 2026-06-15 after food logging returned a provider 404 for `claude-sonnet-4-20250514`.

Root cause:

- Active nutrition, agent, workout, and query paths still hardcoded retired/stale Anthropic model IDs. Text food logging surfaced the raw provider error to the UI, so the missing-model 404 appeared directly.
- Several API routes still initialized Anthropic at module scope, which was brittle for Next.js route loading and environment setup.

Implemented cleanup:

- Added shared `getAnthropicModel()` in `app/lib/anthropic-client.ts`, defaulting to `claude-sonnet-4-6`, with purpose-specific overrides and a stale-model blocklist.
- Moved active Anthropic call sites to the shared lazy client/model helper across meal upload/text/refine/analyze, V2 agent loop, agents, workout OCR/photo parsing, PR bulk import, and query response generation.
- Masked model/not_found/404 provider errors in text meal parsing with a user-safe temporary AI availability message.
- Updated current architecture docs.
- Added model-selection and food/query regression coverage; stabilized full-suite blockers in query integration, tab-cache boundary, and WHOOP cached-staleness tests.

Verification completed:

```bash
npm.cmd test -- test/anthropic-client.test.ts test/food-tracking/integration.test.ts test/query/response-generator.test.ts
npm.cmd test -- test/agents/classifier.property.test.ts test/agents/classifier-preservation.property.test.ts test/agents/classifier-meal-detection-bugfix.property.test.ts test/agents/nutritionist-agent.test.ts test/agents/trainer-agent.test.ts test/agents/socius-agent.test.ts test/api/agent-process-manager.test.ts
npm.cmd test -- test/query/query-integration.test.ts test/sheets/tab-cache.unit.test.ts test/whoop/cached-staleness.property.test.ts
npm.cmd test -- test/query/response-generator.test.ts test/query/query-integration.test.ts
node node_modules\typescript\bin\tsc --noEmit --pretty false
npm.cmd run lint
npm.cmd run build
npm.cmd test -- --reporter=dot --silent
git diff --check
```

Results: all focused slices pass; TypeScript, lint, production build, diff whitespace check, and the full quiet Vitest suite pass. Full quiet suite exits 0 with 130 files and 1890 tests passed. Production build generated all 66 pages/routes.

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

## Adaptive Coach Brain and Memory Planning (2026-07-27)

- qplan issue `Fitness-Tracker-8q5` evaluated four research streams, three architectures, isolated claim verification, and a Tier 4 multi-perspective spec review.
- Recommended direction: a relational-first rolling coach loop in the existing Program and V2 surfaces. Durable, correctable user memories and immutable plan proposals remain application-owned; the LLM explains deterministic planning output and never activates a plan or invents numeric prescriptions.
- First vertical slice: confirmed memory -> one-week proposal -> atomic acceptance -> prescribed-session completion/check-in -> deterministic weekly review.
- Required foundations: a versioned prescription schema distinct from logged workout results, a versioned machine-readable training/safety policy, provenance/freshness-aware context, an atomic activation RPC, RLS/idempotency/race tests, and coaching trace evals.
- Explicitly deferred from v1: embeddings, event sourcing, autonomous adaptation, new standalone Today/Progress screens, offline mutation queues, privacy export tooling, and model shadow/canary infrastructure.
- Product decisions later resolved below: Supabase is canonical with no Google
  Sheets import, and the initial horizon is an eight-week intent with review-led
  deloads in weeks 4 and 8.
- No application implementation or deployment was performed during planning.

## Evidence-Based Coach Training Doctrine (2026-07-27)

- Greg resolved the programming source of truth: the app and Supabase are
  canonical. Google Sheets import or synchronization is no longer part of the
  adaptive-coach plan.
- The planning horizon is an eight-week training intent. Weeks 4 and 8 are
  review-led deloads; the coach reduces the stressors showing fatigue rather
  than applying an identical no-training week to every athlete.
- Initial assessment accepts known 1RM, 3RM, or 5RM values. Derived values must
  remain labeled estimated 1RM, retain their source set/date/confidence and
  calculator version, and be recalibrated from later performance.
- The coaching philosophy is intent-first and concise. The prescription states
  the target adaptation, what the work should feel like, and the success or
  stop condition before adding only the structure needed to act.
- A center-of-gravity review vetted ten cross-disciplinary experts and produced
  ten convergence points, five meaningful divergences, and twelve product
  recommendations. The full report is
  center-of-gravity-report-evidence-based-training-doctrine.md; the concise
  app-facing reference is docs/coach/training-doctrine.md.
- The final reference contains twelve domains: assessment and baselines;
  strength; hypertrophy; power and explosiveness; speed, deceleration, and
  change of direction; aerobic conditioning; anaerobic work capacity; nutrition
  and fueling; resilience and movement capacity; recovery and fatigue;
  movement skill and technique; and adherence and behavior.
- Important evidence correction: hypertrophy work can generally approach one
  to two repetitions in reserve, but power, speed, and explosive work should
  preserve velocity and technique and stop before failure-level fatigue.
- Recovery scores and workload trends are advisory evidence, not autonomous
  plan controls. Medical diagnosis, rehabilitation, injury prediction, and
  restrictive nutrition remain outside the general-wellness coach boundary.
- Bead Fitness-Tracker-4xx tracks this research tranche. Local validation
  confirmed the ten-expert registry, report structure and scoring tags, source
  links, and identical dated/latest report copies. No application code,
  Supabase schema, tests, commit, or deployment were performed.
- Team pass: product/coach architecture led the doctrine; the research builder,
  reviewer, and verifier were handled in the main session because delegation
  was not permitted. No architecture map or ADR changed because this tranche
  adds evidence and policy reference material without changing runtime
  boundaries.

## Adaptive Coach Foundation and First Program Workflow (2026-07-27)

- Work is local on branch `codex/adaptive-coach-brain` in worktree
  `C:\Users\foote\.codex\worktrees\fitness-tracker-adaptive-coach`, based on
  `origin/main` at `76fcb9b`. It is not committed, pushed, deployed, or applied
  to Supabase.
- `app/lib/coach/` now contains the machine-readable twelve-domain doctrine,
  deterministic e1RM and eight-week policy, coach types, and bounded runtime
  loading for confirmed assessments, confirmed memories, and an accepted plan.
- Socius preloads coach state only for manager-classified programming requests;
  read tools can refresh state and select up to four doctrine domains. New write
  tools store only explicit user-confirmed 1RM/3RM/5RM assessments and explicit
  confirmed memory. Numeric prescription, silent plan mutation, and inferred
  memory remain prohibited in the prompt contract.
- `docs/migrations/coach-system-migration.sql` defines assessments, versioned
  memory, eight-week programs, immutable plan versions and prescribed sessions,
  adaptation proposals, and check-ins. Forced RLS, least-privilege grants,
  tenant-consistent foreign keys, indexed access paths, atomic memory versioning,
  stale-proposal rejection, atomic initial proposal creation, and idempotent
  atomic plan acceptance are included.
- `docs/migrations/verify-coach-system-migration.sql` is rollback-only and
  exercises two-user RLS, assessment and memory idempotency, initial and
  replacement activation, atomic proposal retry and mismatch rejection, and
  stale-proposal rejection. The final migration was applied twice and verified
  on a fresh disposable PostgreSQL 17.6 Supabase project. All three RPCs use an
  empty `search_path`, deny anon/public execution, and intentionally allow only
  authenticated/service execution. Performance Advisor found no unindexed
  foreign keys. Both disposable projects and their temporary passwords were
  permanently deleted; production was not modified. Evidence is in
  `docs/migrations/coach-system-verification-2026-07-27.md`.
- The obsolete Google Sheets Program page is replaced by the first athlete-facing
  coach workflow. `/program` now confirms goal, schedule, equipment, constraints,
  and optional known 1RM/3RM/5RM baselines; produces a deterministic qualitative
  eight-week proposal; visibly marks review-led deloads in weeks 4 and 8; and
  requires a separate acceptance action before the plan becomes active.
- `/api/coach`, `/api/coach/intake`, `/api/coach/assessments`,
  `/api/coach/proposals`, and `/api/coach/proposals/[id]/accept` are authenticated
  user-scoped routes. Assessment retries use input fingerprints; intake memories
  are versioned through the RPC; proposal rows and sessions are created in one
  transaction; acceptance refreshes canonical state.
- The accepted Program view reads the immutable stored week intent rather than
  recomputing it from the current policy. V2 remains the discussion/explanation
  surface; Program owns the persistent plan and review state.
- ADR-0003 records the authority boundary: Supabase is canonical for athlete and
  programming state; code owns doctrine and deterministic numeric policy; the
  model explains and proposes; an explicit atomic acceptance transition owns
  activation. The architecture map and migration README reflect this boundary.
- Prior foundation verification passed: focused coach/agent/migration slice (9
  files, 142 tests), full Vitest suite (166 files and 2,073 tests passed; 5 files
  and 7 env-gated tests skipped), strict TypeScript, lint, diff check, and build.
  The new workflow slice passes 10 files and 88 tests. Final full Vitest passes
  169 files and 2,085 tests, with 5 files and 7 intentionally network-gated
  tests skipped. Strict TypeScript, lint with no warnings/errors, and `git diff
  --check` pass. A real browser
  verified the setup, baseline, and proposal layout at 390px and 320px with no
  horizontal overflow, minimum 48px buttons, and zero console errors in the
  final fresh session. A clean placeholder-backed Next.js production build
  compiled successfully, type-checked, generated all 71 routes, and included
  `/program` plus the five `/api/coach` routes. Two earlier sandboxed build runs
  hung because the sandbox could not recreate `.next`; after removing only the
  generated directory and allowing the build to write it, the build completed
  in 30 seconds. Lint was run and passed separately before the final build.
- Existing non-blocking warnings remain: Node's transitive `punycode`
  deprecation during tests, Next 15's `next lint` deprecation notice, and the
  previously reported npm audit findings. No dependency or audit-fix changes
  were made.
- Team pass: product/coach architecture, backend and frontend implementation,
  security/schema review, React review, and verification were completed in the
  main session because agent delegation was not requested. The Supabase
  best-practices pass specifically added composite ownership constraints,
  foreign-key indexes, least privilege, transaction locks, empty `search_path`
  on definer RPCs, and mismatched-payload idempotency rejection. The React pass
  kept data fetching out of render, prevented server/client date drift, and made
  the accepted view read stored plan intent rather than current policy.
- The next vertical slice is execution feedback: prescribed-session completion,
  a concise session check-in, deterministic weekly review, and an inspectable
  adaptation proposal. Production migration, commit, push, and deployment remain
  separate approval gates.
- Bead `Fitness-Tracker-e17` remains the intended tracker, but `bd` was not
  available on PATH in the final session, so its status was not mutated.
