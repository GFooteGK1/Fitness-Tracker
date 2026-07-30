# Handoff

## Installed iOS UPC preview lifecycle fix (local candidate, 2026-07-30)

Greg's signed-in physical-iPhone canary isolated a follow-up to the released UPC
decoder work: scanning succeeds when the site is opened directly in Safari, but
the installed Home Screen app grants camera permission, briefly activates the
camera indicator, and then reports `Barcode camera preview could not start.`
That exact copy occurs before either native or ZXing decoding. `FastMealLogger`
requested `getUserMedia()` first, conditionally mounted the `<video>` only after
permission resolved, and then polled the ref for ten timer ticks. Installed mode
can resume/render slowly enough to exhaust that local timeout.

Branch `codex/fix-ios-pwa-upc-preview` is a local candidate based on `origin/main`
at `e1c55fb`; it is not committed, pushed, deployed, or production-verified
yet. The scoped change mounts the preview and yields through the next
paint before requesting permission. A request generation now makes cancel and
unmount authoritative: any camera stream returned after cancellation is stopped
and never reaches the decoder. The native/ZXing decoder seam, rear-camera
constraints, barcode lookup, manual entry, and no-frame-persistence boundary are
unchanged.

Verification: the new ordering regression failed against the released
implementation and passes after the fix. Focused scanner/nutrition regression
passed 5 files / 31 tests; strict TypeScript and lint passed with no errors or
warnings. The full suite passed 191 files / 2,229 tests, with 5 files / 7 tests
intentionally environment-gated, and the placeholder-backed production build
compiled, type-checked, and generated all 75 routes. A temporary 360px mobile
Playwright route with a controlled camera
proved the preview existed when `getUserMedia()` ran, reached `Scanning...` and
`Point the camera at the barcode.`, had 360px document/viewport width with no
overflow, and returned to `Scan UPC` on cancel. Its only console error/warning
was the expected unauthenticated common-meal request on the temporary route.
The route, browser artifacts/session, dev server, `.next`, and temporary
dependency junction were removed. Beads bug `Fitness-Tracker-vig.1` is in
progress. Remaining release gates are commit/push/CI/deployment approval and
then a repeat Home Screen scan on Greg's iPhone as the only proof of the
original installed-WebKit timing path.

## Production legacy-object containment + UPC runtime fallback fix (2026-07-30)

Released through PR #55 as `main` commit `71f7cba`, from source commit
`6a94858` on branch `codex/fix-prod-db-security-upc` in isolated worktree
`C:\Users\foote\.codex\worktrees\fitness-tracker-db-security`. The production
database containment and matching application release are live and verified.

- Production migration `20260730151344_secure_legacy_database_objects.sql`
  preserves all 28 WHOOP backup rows, enables and forces RLS, removes PUBLIC,
  `anon`, and `authenticated` privileges, and retains service-role maintenance
  CRUD. Security Advisor's three RLS-disabled ERRORs are cleared.
- `get_meals_around_workout(uuid, integer)` keeps its legacy signature, derives
  labels from `meals.items`, runs as SECURITY INVOKER with an empty search path,
  and is executable only by `service_role`. The prior SQLSTATE `42703` lint
  error is cleared.
- The migration applied twice. Its rollback-only verifier passed, and
  independent postflight confirmed row counts `10 / 10 / 8`, forced RLS, zero
  user policies, no `anon`/authenticated CRUD or helper execution, retained
  service-role access, aligned migration history, and an up-to-date final dry
  run. Durable evidence is in
  `docs/migrations/secure-legacy-database-objects-production-application-2026-07-30.md`.
- Beads issues `Fitness-Tracker-vt7` and `Fitness-Tracker-68e` are closed.
  `Fitness-Tracker-k50` remains open only for its other pre-existing advisor
  warnings and product/admin decisions.
- The UPC runtime inconsistency is released. Native frame failures remain
  retryable, but three consecutive failures stop the native loop and hand the
  already-open stream to the existing lazy ZXing decoder exactly once. A
  successful native frame resets the error count. Detection, cancellation,
  unmount, and a late fallback startup all retain one authoritative stop path.
- If native and ZXing decoding both fail, the scanner closes the camera and
  reports that barcode recognition could not start while preserving manual UPC
  and label entry. It no longer mislabels this path as camera-access failure.
- Beads issue `Fitness-Tracker-c0g` is closed under the existing UPC epic.
- PR #55 exact-head CI run `30559375920` passed tests, strict TypeScript, lint,
  and build in 2m07s; its Vercel preview succeeded. The PR was squash-merged to
  `main` as `71f7cba`.
- Main CI run `30559590947` passed the same four gates in 1m58s. GitHub
  deployment `5678113303` and the Vercel commit status both report exact main
  commit `71f7cba` successfully deployed to Production.

Verification: focused migration regression 1 file / 6 tests, focused WHOOP
regression 25 files / 280 tests, focused scanner/component regression 2 files /
15 tests, and the nutrition regression 5 files / 28 tests passed. Strict
TypeScript and lint with no warnings/errors passed. The final release gate also
passed all 191 runnable test files and 2,227 tests, with 5 files and 7
intentionally environment-gated tests skipped. A clean placeholder-backed
Next.js production build compiled, type-checked, and generated all 75 routes.
The only test warning was the pre-existing transitive Node `punycode`
deprecation. At 390x844, Chromium with a
virtual 1280x720 camera and an injected native detector that rejected every
frame made exactly three native attempts, loaded both ZXing chunks, kept the
same stream live and playing, and had no horizontal overflow. Cancel removed
the preview, ended the camera track, and restored `Scan UPC`. The only browser
console error/warning came from the intentionally unauthenticated temporary
route's common-meal request, not the scanner. The temporary route was not
retained. In addition,
documented/canonical migration SHA-256 matched; migration dry-run/apply/direct
reapply/verifier/lint/advisor/postflight/history checks passed; `git diff
--check` passed after the final documentation update. Temporary routes,
browser sessions/artifacts, server, build output, Supabase link files, and
dependency junction were removed. Team pass: `@software-engineer` implemented
the bounded migration and UPC lifecycle fix; `@reviewer` checked callers,
grants, signature, RLS, repeatability, camera privacy, async handoff races,
duplicate detection, cleanup, and manual fallback; `@verifier` performed live
production database readback plus unit, static, and mobile-browser proof;
`@debugger` isolated the UPC browser-dependent failure. No subagents were used
because Greg did not request delegation.

Next boundaries: the temporary history-normalized runner migration fetched
during preflight was removed; reconcile this security branch after the
canonical v0.5 migration enters source control. The deployment-specific URL is
protected by Vercel SSO, so no browser login was attempted and Greg's work
Vercel identity was not connected. The remaining product canary is one signed-
in UPC scan on Greg's phone after the release.

## Adaptive coach execution feedback (released and production-deployed)

Released on 2026-07-29 through PR #53 as `main` commit `43211d4`, from source
commit `d6f3ece` on branch `codex/coach-execution-feedback`, in the isolated
worktree
`C:\Users\foote\.codex\worktrees\fitness-tracker-pr-dedupe-review`.
The production database migration is applied and rollback-verified, and the
matching application release is deployed.

- `app/lib/coach/execution-feedback.ts` owns validated session outcomes,
  session RPE, energy, pain signals, notes, and the deterministic weekly-review
  rules. Program reads do not call an LLM. A review waits until every session
  is terminal, never diagnoses pain, never invents a numeric adjustment, and
  never mutates an accepted plan.
- `/api/coach/sessions/[id]/complete` authenticates the athlete, validates the
  bounded feedback payload, and calls one atomic database RPC before returning
  refreshed canonical coach context.
- `coach-execution-feedback-migration.sql` and its byte-identical generated
  Supabase migration add `record_coach_session_result`. The security-definer
  function locks the active program and prescribed session, verifies accepted
  active-plan ownership, supports exact idempotent retries, and atomically
  writes the terminal session state plus its check-in. Authenticated direct
  writes to the two execution-feedback tables are revoked; only authenticated
  RPC execution is granted.
- The rollback-only verifier covers completed and skipped results, exact retry,
  mismatched retry rejection, cross-user rejection, and final privileges. It
  passed against production after the migration was applied twice.
- Coach context now loads all 48 possible sessions plus bounded session
  check-ins and computes the current-week review in application code. An
  invalid or missing check-in holds the plan for review instead of inferring a
  result.
- Program shows unresolved prior-week sessions, current and upcoming work,
  terminal status and feedback, a concise mobile check-in, and an inspectable
  adaptation preview. A lower-stress recommendation explicitly requires the
  athlete to build and accept a replacement proposal; no future prescription
  changes silently.
- Reviewer tightening preserved immutable accepted prescriptions, existing
  legacy rendering, RLS/tenant boundaries, deterministic compute authority,
  and mobile control sizing. The 320px browser pass shortened the native
  outcome choices so the selected value no longer clips.

Verification on Node 24.13.1:

- Focused coach/API/UI/migration regression: 6 files and 66 tests passed.
- Final full silent Vitest: 190 files and 2,215 tests passed; 5 files and 7
  intentionally environment-gated tests skipped.
- Strict TypeScript, lint with no warnings/errors, and `git diff --check`
  passed.
- A clean placeholder-backed Next.js 15.5.22 production build compiled,
  type-checked, generated all 75 source routes, and included
  `/api/coach/sessions/[id]/complete` plus `/program`. The first sandboxed build
  stalled on stale generated `.next` permissions; only the verified ignored
  build directory was removed, and the final unsandboxed source-only build
  passed.
- Playwright exercised the compiled feedback form at 320px and 390px. Document
  width matched the viewport, every button/input/select/textarea was at least
  44px high, the skipped outcome removed session RPE, and the console had zero
  errors or warnings. The temporary route, screenshots, and browser snapshots
  were removed before the final build.

Release boundary:

- Production database verification is complete. Preflight and postflight both
  show 5 auth users, 1 active program, 2 plan versions, 96 sessions, and 0
  check-ins. Forced RLS, least-privilege grants, empty function search path, and
  the accepted-session content trigger were read back independently. Durable
  evidence is in
  `docs/migrations/coach-execution-feedback-production-application-2026-07-29.md`.
- PR #53 exact-head CI run `30484776768` passed tests, strict TypeScript, lint,
  and build for source commit `d6f3ece`; its Vercel preview succeeded. The PR
  was squash-merged to `main` as `43211d4`.
- Main CI run `30484942094` passed the same four gates in 1m32s. Supabase's
  main-branch check succeeded. GitHub deployment `5663871929` and the Vercel
  commit status both report exact main commit `43211d4` successfully deployed
  to Production.
- The personal-project production alias
  `fitness-tracker-gregs-projects-98860c8b.vercel.app` resolves but redirects
  unauthenticated requests through Vercel SSO. No Vercel login was attempted,
  so Greg's work Vercel identity was not connected. The remaining product
  canary is Greg's signed-in completion or skip of one prescribed session from
  Program, followed by confirmation that the saved result survives a refresh.
- Automated CodeRabbit review was unavailable because the CLI was absent and
  its installer could not execute through the available Windows/WSL path. The
  local reviewer pass covered auth, RLS, atomicity, idempotency, immutable-plan
  behavior, React state, accessibility, and regression risk instead.
- Beads was not updated because the `bd` command is unavailable in this
  environment; no `.beads` files were edited manually.

Team pass: the software-engineer role led implementation; the reviewer role
checked database authority, cross-user access, retry conflicts, immutable-plan
and UI regressions; the verifier role ran focused/full tests, TypeScript, lint,
diff, production build, and compiled mobile-browser checks. Separate agents
were not used because Greg did not request delegation.

## UPC camera scanner compatibility fix (released and production-verified)

Released on 2026-07-29 through PR #50 as `main` commit `4d25473`, from source
commit `a68c198` on branch `codex/fix-upc-camera-scanner`, in the isolated worktree
`C:\Users\foote\.codex\worktrees\fitness-tracker-pr-dedupe-review`.

- Root cause: `FastMealLogger` returned before `getUserMedia()` whenever the
  browser did not expose the experimental native `BarcodeDetector`. This is
  common on mobile browsers and explains why tapping **Scan UPC** did not open
  the camera.
- `app/lib/nutrition/barcode-scanner.ts` now owns scanner lifecycle. It prefers
  the native detector when available and lazily loads ZXing's one-dimensional
  reader otherwise. Only UPC-A, UPC-E, EAN-8, and EAN-13 are enabled.
- `FastMealLogger` now requests the rear camera independently of native barcode
  support, waits for the preview element, starts the decoder, disables duplicate
  start requests, and stops decoder and media tracks on detection, cancel, or
  unmount. Manual barcode and label entry remain available.
- Camera permission denial, missing camera, and camera-in-use failures now have
  actionable messages. No image or camera frame is persisted.
- `@zxing/browser` 0.2.1 and `@zxing/library` 0.23.0 are the only new production
  dependencies. They are split into on-demand scanner chunks; the normal `/v2`
  initial bundle is unchanged. The production dependency audit reports no ZXing
  advisory. The existing Next/PostCSS/Sharp advisories remain separate.
- Regression coverage proves camera startup without native `BarcodeDetector`,
  rear-camera constraints, decoder startup, detected-code lookup, cancel and
  detection cleanup, unsupported-camera manual fallback, permission guidance,
  native decoding, lazy ZXing fallback, and UPC/EAN-only hints.

Verification on Node 24:

- Focused scanner/component: 2 files, 9 tests passed.
- Nutrition/fast-log regression: 8 files, 32 tests passed.
- Full silent Vitest: 188 files and 2,203 tests passed; 5 files and 7
  intentionally environment-gated tests skipped. An earlier noisy run had one
  transient failure; the immediate clean silent rerun passed the full suite.
- Strict TypeScript, lint with no warnings/errors, and `git diff --check` pass.
- Placeholder-backed Next.js production build passes and generates all 75
  routes. The first build without placeholders compiled and type-checked, then
  correctly stopped because the clean worktree lacked public Supabase build
  variables. A later sandboxed retry stalled on generated `.next` permissions;
  removing only the ignored build output and rerunning with write permission
  completed successfully.
- PR CI run `30475473605` passed tests, TypeScript, lint, and build for exact
  source commit `a68c198`; its Vercel preview succeeded. PR #50 was squash-
  merged to `main` as `4d25473`. Main CI run `30475672620` passed the same four
  gates in 2m04s. GitHub deployment `5662126268` and the Vercel commit status
  both report the exact main commit successfully deployed to Production.
- The deployment-specific production URL redirects unauthenticated requests to
  Vercel SSO, so no work-account login was attempted. The repository homepage
  alias `fitness-tracker-eta-lilac.vercel.app` is stale and returns Vercel
  `DEPLOYMENT_NOT_FOUND`; it is not release evidence. Physical camera behavior
  is not yet verified on Greg's signed-in phone and remains the product canary.

Team pass: frontend implementation led the camera and user-feedback changes;
the reviewer checked async start/cancel races, decoder and media cleanup,
unsupported/denied fallbacks, mobile target sizing, dependency scope, lazy
loading, and preservation of manual entry. The verifier ran focused and full
tests, TypeScript, lint, audit, diff check, and the production build. Separate
agents were not used because Greg did not request delegation.

## Complete programming kernel v0.3 (released and production-verified)

Released on 2026-07-29 through PR #48 as `main` commit `cea983d`, from branch
`codex/evidence-backed-programming-reference` in the isolated worktree
`C:\Users\foote\.codex\worktrees\fitness-tracker-pr-dedupe-review`.

Release status: complete. Application integration and all local quality gates passed.
The compatibility migration was applied to production twice on July 29 and
passed its rollback-only verifier plus independent constraint, row-count,
RLS, privilege, and trigger readback. No production row counts changed. Source
commit `7d8679b` and release evidence commit `e38f00a` passed exact-head CI in
PR #48. The PR was squash-merged to `main` as `cea983d`. Main CI run
`30452185991` passed tests, strict TypeScript, lint, and build in 2m05s;
Supabase's merge integration succeeded; and Vercel reported the exact merge
commit deployed successfully to Production. The public `/program` route returned
HTTP 200. The protected preview redirects to Vercel SSO, so no work-account
login was attempted.

- The prior twelve-domain doctrine remains valid. This tranche narrows the
  unresolved question to how complete eight-week plans, training weeks, and
  sessions are assembled for generally healthy adults training two to six days
  per week.
- `docs/coach/complete-programming-evidence-research.md` is a new autonomous
  center-of-gravity report based on the 2026 ACSM position stand and primary
  reviews/meta-analyses covering dose and frequency, split versus full body,
  exercise order, warm-up, rest, movement selection, autoregulation, velocity
  loss, sprint and power practice, HIIT construction, concurrent training,
  periodization critique, and time-efficient supersets.
- The central conclusion is that completeness is defined by adaptation roles,
  weekly coverage, and the athlete's time and recovery budget, not a universal
  exercise count. Specific preparation and the priority adaptation are default
  requirements. Secondary, assistance/capacity, conditioning, and downshift
  work are included only when each fills a named need.
- `app/lib/coach/programming-reference.ts` is the versioned machine-readable
  source registry, evidence-rule set, and product composition contract. It
  explicitly separates evidence claims from product decisions, preserves the
  compute-in-code and athlete-acceptance boundary, labels weeks 4 and 8 as
  product-defined review checkpoints, and is not yet imported by the live
  planner.
- `app/lib/coach/programming-schema.ts` adds the migration-safe v0.3 contracts:
  one lead goal and at most two bounded secondary goals, per-day 30-to-90-minute
  availability, resolved-versus-unresolved equipment and constraint facts,
  factual recent training, traceable weekly coverage requirements and ledgers,
  six block roles, structured dose/execution/load details, and a stored-format
  detector. The legacy intake adapter copies the original v0.2 snapshot and
  deliberately does not interpret free-text equipment or limitations.
- `app/lib/coach/programming-policy.ts` adds deterministic product policy
  `0.3.0`, linked to the evidence reference. It owns goal-allocation limits,
  supported session time and preservation behavior, domain-specific coverage
  kinds and numeric starting anchors, output-preserving recovery, one-variable
  progression, and review-led weeks 4 and 8. Every dose anchor is labeled
  `product_policy`, cites evidence-rule IDs, and avoids a universal exercise
  count.
- `app/lib/coach/movement-catalog.ts` is the versioned v0.3 catalog with 61
  definitions across every supported domain. Each movement owns stable IDs,
  intent, patterns and regions, equipment, skill/fatigue/impact costs,
  unilateral/overhead/running flags, assessment aliases, explicit coverage
  targets, a substitution group, and a progression family. New or returning
  athletes have a low-skill bodyweight fallback in every domain.
- Catalog eligibility is deterministic over resolved equipment, training
  experience, and explicit no-overhead/no-running constraints. Substitutions
  must remain in the same substitution group and preserve the requested domain
  and every requested coverage target. The source must own that coverage too,
  preventing a drill or bike effort from being relabeled as true locomotor
  sprint exposure. When no equivalent exists, the result is empty so the
  scheduler can surface an equipment or constraint gap.
- `app/lib/coach/weekly-coverage.ts` converts the normalized primary and
  secondary goals into an inspectable weekly ledger before exercise selection.
  Versioned policy now holds 22 goal/domain coverage templates, including
  target type, priority, bounded secondary rank, dose anchor, exposure range,
  estimated time, recovery preference, incompatibilities, and evidence rules.
- The scheduler accounts for 2-to-6-day, 30-to-90-minute schedules; derives
  weekly sets, quality repetitions, minutes, or intervals from policy anchors;
  retains recent factual dose inside policy bounds; starts new/returning
  athletes at minimum frequency; separates high-cost aerobic intervals from
  lead power/speed when possible; and emits explicit reduced or omitted gaps
  for time, recovery, equipment, constraints, experience, or unsupported
  coverage. It does not choose a movement or prescribe a load.
- Assessment matches retain exact assessment-to-movement candidates.
  Ambiguous aliases remain inspectable but are excluded from the safe load
  anchor ID list, so a generic `Deadlift` assessment cannot silently anchor a
  kettlebell or barbell movement. Weeks 4 and 8 are marked for review without
  automatically rewriting or deloading the ledger.
- `app/lib/coach/session-composer.ts` turns each assigned day into a complete
  v0.3 session. Preparation directly rehearses that day's selected priority
  movement or modality; the remaining ledger assignments become ordered
  priority, secondary, assistance/capacity, or conditioning blocks. Every work
  movement exposes its role, coverage requirement, exact planned dose,
  execution target, rest, success/stop conditions, evidence, deterministic
  selection reasons, and only coverage-equivalent eligible substitutions.
- Movement selection scores unambiguous assessment matches first, then explicit
  preferences, recent familiarity, and lower fatigue cost with stable-ID ties.
  Strength load guidance uses a policy-owned 65-75% starting range only when one
  saved assessment maps unambiguously to the selected movement; ambiguous
  aliases and unmatched exercises receive no invented load. Sessions fail fast
  if upstream assignments could ever exceed the accepted time budget. When no
  equivalent eligible substitute exists, the prescription says to revise the
  plan rather than naming a false swap. Unused available days remain explicit
  instead of being filled with arbitrary work.
- `app/lib/coach/complete-program.ts` now assembles eight deterministic weekly
  ledgers and their complete sessions into one versioned draft while preserving
  the accepted profile snapshot. Weeks 4 and 8 remain pending athlete review;
  the builder does not infer fatigue, fabricate a deload, activate a plan, or
  change the profile between weeks.
- `app/lib/coach/program-validator.ts` is the non-mutating whole-plan gate. It
  reconciles requirement, ledger, assignment, day, block, exercise, dose, and
  time references; validates ordering, equipment, experience, explicit
  constraints, movement coverage, substitutions, conditioning detail, rest,
  execution and stop guidance; and recomputes assessment-based load ranges
  from the saved e1RM, percentage, unit, and rounding policy.
- Six executable goldens span every supported programming domain, new,
  consistent, and experienced athletes, 2-to-5-day schedules, 30-to-75-minute
  availability, and bodyweight through mixed equipment. They freeze exact
  first-week movement selections and validate all eight weeks. Adversarial
  mutations prove that missing preparation, unaccounted coverage, time drift,
  vague intervals, false substitutions, ineligible movements, unsupported
  loads, malformed input, and incorrect review state fail. The legacy v0.2
  one-primary-plus-one-support proposal cannot pass as complete v0.3.
- `docs/coach/programming-kernel-v0.3-validation.md` records the golden matrix,
  failure gate, and remaining release boundary without committing brittle
  full-plan JSON snapshots.
- `app/lib/coach/complete-intake.ts` validates a structured v0.3 setup with
  resolved equipment, explicit no-overhead/no-running constraints, and up to
  two bounded secondary goals. Free-text notes remain unresolved context and
  are never interpreted as deterministic eligibility facts.
- `/api/coach/proposals` now builds a complete eight-week v0.3 draft, runs the
  whole-plan validator, fingerprints the exact proposal and source snapshot,
  and only then calls the existing atomic initial or replacement RPC. The
  legacy v0.2 planner remains compatibility code; accepted prescriptions are
  always read from their stored payload and never recomputed.
- The Program setup stores the new structured facts through the existing
  versioned memory RPC. Proposal review exposes weekly coverage, complete
  sessions, why every block exists, dose, feel, rest, success and stop
  conditions, load provenance, substitutions, and selection reasons.
- The accepted-plan renderer branches on stored format. Complete v0.3 sessions
  use the new renderer while legacy v0.2 sessions retain their existing
  detailed renderer. An explicit regression proves the legacy read path.
- `coach-complete-programming-v0-3-migration.sql` broadens only the immutable
  prescription JSON check to accept legacy v0.2 and complete v0.3. Constraint
  replacement and existing-row validation use separate short transactions;
  new writes remain enforced throughout. RLS, grants, triggers, tables, and
  RPCs are unchanged. The generated Supabase migration is byte-identical.
- `docs/coach/programming-kernel-v0.3-spec.md` defines the next architecture:
  normalized goal allocation, weekly coverage ledger, tagged movement catalog,
  deterministic role-based session composer, time-budget hierarchy, mixed-goal
  sequencing, progression/review, completeness validation, and golden plans.
  The architecture map now records this reference and future boundary.
- The root `center-of-gravity-report-complete-programming-construction.md`
  points to the canonical report and machine-readable reference.
- Production project `fitness-tracker` (`auolnfwetmfcwhtvakzy`, PostgreSQL
  17.6) accepted the compatibility migration twice. The installed constraint is
  validated and accepts both legacy v0.2 and complete v0.3 prescriptions. Auth
  users, programs, plan versions, and sessions remained 5 / 1 / 2 / 96 before
  and after the rollback-only verifier. See
  `docs/migrations/coach-complete-programming-v0-3-production-application-2026-07-29.md`.

Beads:

- Epic `Fitness-Tracker-jmi` tracks the complete programming kernel.
- `Fitness-Tracker-jmi.1` through `Fitness-Tracker-jmi.6` track the completed
  local evidence/reference, schema/policy, movement-catalog, and weekly
  scheduler/session-composer/whole-plan-validation tranches.
- `Fitness-Tracker-jmi.7` remains in progress. Local Program integration,
  compatibility, mobile verification, repository gates, and live migration
  apply-twice/rollback verification are complete. The remaining release
  boundary is commit/CI, deployment, and safe production application readback.

Verification on Node 24.13.1:

- The reference source-resolution test failed first and was corrected in the
  prior tranche. The v0.3 schema/policy tests then failed first on the two
  intentionally absent modules before implementation.
- The movement catalog test then failed first on the intentionally absent
  module. A focused run caught that row-erg skill eligibility needed a
  consistent athlete in the test and that punctuation-normalized push-up
  aliases were duplicates; both catalog/test facts were corrected.
- The weekly scheduler test failed first on the intentionally absent module.
  Strict TypeScript later caught narrow `never[]` inference in internal day
  state; the arrays were explicitly typed before the repository gate.
- Final focused coach regression passed: 7 files and 59 tests, including 100
  randomized catalog eligibility combinations and 100 randomized domain,
  day-count, and session-length schedules.
- The session composer test failed first on the intentionally absent module.
  Reviewer tightening added fail-fast budget enforcement, exact
  assessment-to-movement load anchoring, task-specific preparation, and honest
  no-equivalent-substitution guidance.
- Final focused coach regression passed: 8 files and 64 tests, including 100
  randomized complete-session profiles.
- The whole-plan test failed first because the builder and validator modules
  did not exist. Reviewer tightening then added malformed-input safety, exact
  ledger/day/block accounting, source movement coverage, explicit-constraint
  enforcement, deterministic load recomputation, duplicate protection, and
  exact first-week golden selections.
- Final focused coach regression passed: 11 files and 83 tests. The new
  whole-plan slice contributes 14 tests, including six named eight-week
  goldens, adversarial mutations, the v0.2 rejection regression, and 36
  randomized deterministic domain/state combinations.
- Final full quiet Vitest passed: 185 files and 2,192 tests passed; 5 files and
  7 intentionally environment-gated tests skipped.
- Strict TypeScript with incremental output disabled, lint with no warnings or
  errors, tracked diff whitespace, and an explicit untracked-file whitespace
  scan passed. Existing non-blocking Next 15 lint deprecation and transitive
  Node `punycode` warnings remain.
- The final coach integration slice passes 16 files and 115 tests, including
  atomic initial/replacement proposal contracts, complete-plan rendering,
  legacy stored-session rendering, and the dual-format migration contract.
- Full quiet Vitest passes 187 files and 2,198 tests; 5 files and 7 intentionally
  environment-gated tests are skipped. Strict TypeScript with incremental
  output disabled and lint with zero warnings or errors pass.
- A placeholder-backed Next.js 15.5.9 production build compiled, type-checked,
  generated all 75 routes, and included `/program` plus the coach APIs without
  contacting a production service.
- Playwright rendered a representative strength-plus-aerobic proposal at 320px
  and 390px. Document width matched each viewport, the acceptance control was
  48px high, complete session content remained readable, and a compiled-page
  reload reported zero console errors. Temporary visual routes, environment
  values, screenshots, Playwright logs, and stale generated route types were
  removed afterward.

Team pass: product/coach architecture led the role-based completeness,
migration, and authority decisions; the research builder performed the
multi-source evidence synthesis; the software builder added the schema, policy,
catalog, and TDD coverage; the reviewer checked evidence-versus-product
labeling, snapshot aliasing, coverage-priority trimming, numeric authority,
legacy compatibility, graph connectivity, substitution equivalence, dose
accounting, time/recovery gaps, interference placement, and ambiguous
assessment provenance. The session-composer review also checked task-specific
preparation, block order, time, load provenance, substitutions, and movement
selection traceability. The whole-plan review checked eight-week identity,
coverage and time reconciliation, exact dose preservation, constraint and
substitution eligibility, conditioning completeness, load recomputation,
review-state honesty, malformed inputs, and legacy rejection; the verifier ran
focused and full tests, strict TypeScript, lint, and tracked/untracked
whitespace checks. The jmi.7 review additionally checked structured-input
validation, proposal fingerprinting, existing RPC contracts, dual-format stored
reads, mobile disclosure hierarchy, and explicit replacement acceptance. The
Supabase/Postgres best-practices pass shortened the constraint replacement lock
scope by moving existing-row validation into a second transaction. Separate
agents were not used because Greg did not request delegation.

Production Supabase has the verified dual-format compatibility constraint, and
no data rows or dependencies changed. Post-merge readback confirmed the
migration is recorded in `supabase_migrations`, the constraint remains validated
for both formats, and users/programs/versions/sessions remain 5 / 1 / 2 / 96.
The authenticated browser canary was not performed because the local browser
control runtime could not start; this was a tooling failure, not an app or login
failure. No production plan was created or accepted for testing. The rollback-
only database verifier, exact-head CI, Supabase integration, exact-commit Vercel
status, and public Program response provide the completed release evidence.

## Fast nutrition logging, reviewed label facts, and UPC/EAN capture (released and production-verified)

Released on 2026-07-28 through PR #46 as exact `main` commit `4064ba3` from
branch `codex/fast-nutrition-logging` in the clean worktree
`C:\Users\foote\.codex\worktrees\fitness-tracker-pr-dedupe-review`.

- The existing Add Meal surface now begins with deterministic common meals and
  packaged-food entry. Photo, voice, and text remain available beneath it.
- Common meals are a projection of the 300 most recent user-owned meal rows.
  Exact macro/item snapshots are grouped and ranked by frequency, recency, and
  a stable signature. Rows still needing review are excluded. One tap copies
  the snapshot into a new meal with a fresh local-date-aware UTC timestamp;
  neither ranking nor logging calls an LLM.
- Quick-log retries reuse their request UUID. The generated migration adds a
  per-user unique request index, a tenant-consistent source-meal foreign key,
  and explicit entry-method provenance, so an uncertain response or concurrent
  retry cannot create a second meal.
- `food_catalog_entries` stores private reviewed name/brand/barcode, serving
  basis, macros, normalized source nutrition, explicit correction differences,
  bounded source metadata, and fetch/verification/use timestamps. Logged meal
  items retain their own macro and provenance snapshot. No meal or label image
  is retained.
- Barcode lookup checks the user's saved catalog first, then uses a fixed-host,
  fixed-field Open Food Facts v3 adapter with a custom app identity, six-second
  timeout, redirect rejection, and 256 KB response cap. UPC-A, UPC-E, EAN-8,
  EAN-13, and GTIN-14 normalization/checks are deterministic. Provider facts
  are re-read when first logged, and the athlete must review the product,
  serving, and macros before any meal is written.
- The client progressively uses the native Barcode Detection API for UPC/EAN.
  Manual barcode and full manual-label entry remain available when camera APIs,
  permission, a product match, or the provider are unavailable. No production
  dependency was added.
- ADR-0004 records the canonical-meal, private-catalog, review-first, and
  compute-in-code decisions. The architecture map and migration registry now
  include the new boundaries.

Database and release state:

- Generated forward migration
  `supabase/migrations/20260728143952_nutrition_fast_logging.sql` creates the
  catalog, forced owner-scoped RLS, least-privilege grants, bounded constraints,
  indexes, request idempotency, and source-meal ownership constraints.
- `docs/migrations/verify-nutrition-fast-logging.sql` is rollback-only and
  checks structure, grants, request idempotency, cross-user catalog isolation,
  and cross-user source-meal rejection with two auth users.
- Greg authorized the production release. The migration was applied once
  through linked migration push, executed a second time against the live schema,
  and passed the rollback-only two-user verifier. Independent readback confirmed
  five auth users, 358 meals, zero catalog rows, one migration-history row, all
  expected columns/constraints/indexes/policies/grants, forced RLS, and an empty
  trigger-function `search_path`. Counts matched preflight, so the verifier left
  no fixtures. The post-application advisors reported no finding tied to the new
  catalog or fast-log boundaries. Durable evidence is in
  `docs/migrations/nutrition-fast-logging-production-application-2026-07-28.md`.
- PR #46 passed exact-commit CI on `ba6c552` in 1m19s and its Vercel preview
  completed successfully. It was squash-merged to `main` as `4064ba3`. Main CI
  run `30381790603` passed tests, strict TypeScript, lint, and build in 1m55s.
  GitHub deployment `5644247088` and Vercel both report the exact merge commit
  successfully deployed to Production.
- Anonymous POST canaries for `/api/meals/quick-log` and `/api/foods/log`
  reached the application and returned the expected 401. Anonymous GETs for
  `/api/meals/common` and `/api/foods/barcode` were intercepted by the existing
  Vercel SSO boundary with 302 before application routing. A signed-in common,
  manual-label, and barcode canary was not attempted because the available
  browser Vercel identity is Greg's work account and must remain disconnected
  from this personal project.

Final verification on Node 24.13.1:

- TDD produced the expected initial failures before the new modules/routes and
  again for UPC-E checksum handling plus retry-stable request IDs.
- Final feature slice: 7 files and 27 tests passed. The adjacent nutrition
  regression slice passed 12 files and 80 tests.
- Final full Vitest passed with 0 failures: 178 files passed, 5 skipped; 2,141
  tests passed, 7 intentionally environment-gated tests skipped.
- Strict TypeScript with incremental output disabled, lint with zero warnings
  or errors, tracked and untracked whitespace checks, and the final
  placeholder-backed production build passed. The build generated all 75
  routes, including the four new fast-nutrition APIs, and contacted no
  production service.
- Playwright verified manual-label and unsupported-scanner states at 320px.
  Document/body width matched the 320px viewport, Scan UPC and Log reviewed
  food were both 48px high, and the clean console had zero errors or warnings.
  The temporary route, environment file, browser state, screenshots, server,
  and generated stale route type were removed.
- Existing non-blocking warnings remain: Next 15's lint deprecation notice,
  seven-month-old Browserslist data, and transitive Node `punycode` warnings.

Team pass: product/data architecture, backend and frontend implementation,
security/schema review, React review, and verification were completed in the
main session because Greg did not request delegation. The review added true
UPC-E validation, retry-stable idempotency keys, current review timestamps on
quick logs, fixed-host/size/time provider bounds, forced RLS, tenant-consistent
foreign keys, correction provenance, and accurate non-review-pending language.

Bead `Fitness-Tracker-vig` remains in progress only for a signed-in production
canary of the common-meal, manual-label, and barcode flows. The migration,
release, exact-commit CI, production deployment, and anonymous write-route
canaries are complete; do not connect Greg's work Vercel identity to close the
remaining canary gap.

## Personal-record idempotency and local-day Today's Read (released and production-verified)

Released on 2026-07-28 from current `origin/main` on branch
`codex/pr-dedupe-local-day` in the clean worktree
`C:\Users\foote\.codex\worktrees\fitness-tracker-pr-dedupe-review`.

- Production readback confirmed that one July 28 workout created repeated and
  intermediate `personal_records` rows. PR detection now collapses the complete
  workout to one best weight, reps-at-load, time, and session-volume candidate
  per exercise/type before comparing history. Historical volume is aggregated
  at the same whole-session boundary.
- `/api/check-prs` now uses an idempotent upsert keyed by
  `(user_id, workout_id, exercise, pr_type)`. The generated forward migration
  `supabase/migrations/20260728134202_personal_record_idempotency.sql` first
  retains the best existing result for each key and then adds the matching
  unique constraint. The migration must run before the API is deployed.
- A production dry run found 14 redundant/intermediate rows across six record
  keys for one user. Greg approved the production cleanup on 2026-07-28. The
  migration applied successfully and preserved one best result per key; final
  readback reports zero duplicate groups, one matching unique constraint, and
  one migration-history row. Post-application advisors reported no finding on
  `personal_records`; no RLS policy or grant changed.
- Opening the dashboard does call the authenticated narrative endpoint, but an
  unchanged fact/template fingerprint returns the stored `view_compositions`
  result without calling the LLM. The existing cache-hit regression test proves
  `complete` is not called. Production had two July 28 compositions associated
  with actual fact changes rather than one composition per app open.
- Meal timestamps remain correctly stored as UTC. The defect was the dashboard
  readiness RPC grouping `DATE(meal_timestamp)` in UTC. The narrative store now
  queries the user-scoped seven-day meal window, groups meals by the browser's
  validated timezone offset, and recomputes target percentages from
  `daily_targets`. A production example stored at 01:09 UTC now remains on the
  prior America/Chicago calendar day. The narrative prompt also forbids calling
  prior-date meals or workouts "today."
- Recent PR facts are read in deterministic order and defensively collapsed to
  one best workout/exercise/type result, keeping cache fingerprints stable even
  before the production cleanup is applied.

Verification on Node 24.13.1:

- Focused PR regression slice: 2 files and 28 tests passed, including a failing
  first run that exposed the historical session-volume mismatch.
- Final full Vitest suite passed with 0 failures (171 files passed, 5 skipped;
  2,114 tests passed, 7 intentionally env-gated tests skipped).
- Strict TypeScript with incremental output disabled, lint with no warnings or
  errors, and `git diff --check` passed.
- The final placeholder-backed Next 15.5.9 production build compiled,
  type-checked, generated all 71 routes, and included `/api/check-prs` and
  `/api/dashboard-narrative`. The build contacted no production service.
- Existing non-blocking warnings remain: the Next 15 lint deprecation notice,
  stale Browserslist data during build, and Node's transitive `punycode`
  warnings during tests. No dependency changes were made.

Release boundary:

- The production migration is applied and independently read back. Durable
  evidence is in
  `docs/migrations/personal-record-idempotency-production-application-2026-07-28.md`.
- PR #44 passed exact-commit CI on `99ec822` in 1m47s and its Vercel preview
  completed successfully. It was squash-merged to `main` as `a0ddd03`.
  Main-branch CI run `30367516991` passed tests, strict TypeScript, lint, and
  build in 1m43s. Vercel reported the exact merge commit deployed successfully
  to Production.
- A signed-in browser canary was not attempted because the available browser
  identity is Greg's work Vercel account and must not be connected to this
  personal project. Exact-commit GitHub/Vercel readback plus the independent
  database readback are the release proof.
- Team pass: the main session handled lead debugging/product behavior, software
  implementation, data/security review, and verification because Greg did not
  request delegation. The review added database idempotency, user-scoped local
  meal reads, deterministic cache inputs, and matched current/historical volume
  semantics. No new provider call or authority boundary was introduced.
- Bead `Fitness-Tracker-bq1` is complete and may be closed after this release
  record merges. The next nutrition logging tranche is tracked separately as
  P1 epic `Fitness-Tracker-vig`; do not mix it into this released fix.

## Actionable adaptive coach prescriptions (released and production-verified)

Prepared on 2026-07-27 from `origin/main` on branch
`codex/program-specificity` in the clean worktree
`C:\Users\foote\.codex\worktrees\fitness-tracker-program-specificity`.

- Replaced the repeated qualitative session output with policy 0.2.0: six
  domain-specific three-session rotations, equipment-supported movement
  selection, bodyweight fallbacks, timed preparation/primary/support blocks,
  working ranges, effort, recovery, stop rules, substitutions, and
  one-variable progression.
- Weeks 4 and 8 remain review-led deloads. Weeks 3 and 7 carry the highest
  planned volume; new or returning athletes receive a reduced starting dose.
- Explicit `no overhead` and `no running` constraints filter only those bounded
  categories. Other constraint text stays visible as an athlete note and is not
  interpreted as a medical diagnosis. Ordinary gym access does not imply track
  or hill access.
- Matching strength assessments add labeled e1RM percentage and rounded load
  ranges to primary strength work only. Unmatched and support movements receive
  no invented load guidance.
- `/program` now renders the full prescription in collapsed week groups and in
  the accepted-plan view. An athlete with an active plan can preview a
  replacement while the current plan remains active, cancel it, or explicitly
  accept it.
- `create_training_plan_replacement_proposal` stores the proposed version and
  sessions atomically against the active base. The revised acceptance RPC
  rejects stale bases, supersedes the prior accepted version, and applies the
  reviewed title, goal, and dates only during acceptance.

Verification completed locally on Node 24.13.1:

- Focused coach/API/UI/migration verification: 4 files and 47 tests passed.
- Full Vitest: 2,106 passed, 7 intentionally env-gated tests skipped, 0 failed.
- Strict TypeScript, lint with no warnings/errors, and `git diff --check` passed.
- A clean placeholder-backed Next 15.5.9 production build compiled, type-checked,
  prerendered all 71 routes, and included `/program` plus the coach APIs. The
  build required an unsandboxed write to generated `.next` artifacts because
  sandboxed Node received `EPERM`; no production service was contacted.
- Playwright verified the proposal at 390px and 320px: document width matched
  viewport width, no horizontal overflow occurred, and the console had no
  errors or warnings. Temporary preview and browser artifacts were removed.

Release boundary:

- Greg authorized release on 2026-07-27. The replacement migration was applied
  twice to production and the final rollback-only verifier passed. Independent
  readback confirmed the verifier left 5 auth users, 1 program, 1 accepted plan
  version, 1 proposal, and 48 sessions—the same state as preflight. Both definer
  RPCs retain an empty `search_path`; anon/public execution and authenticated
  direct table mutation are denied. Durable evidence is in
  `docs/migrations/coach-plan-replacement-production-application-2026-07-27.md`.
- Security Advisor added only the expected authenticated-definer warning for the
  bounded replacement RPC; Performance Advisor reported no coach-schema finding.
  Existing unrelated advisor findings remain unchanged.
- PR #42 passed exact-commit CI in 1m38s and its Vercel preview completed. It was
  squash-merged to `main` as `87c6d46`. Main CI run `30313385336` passed tests,
  strict TypeScript, lint, and build in 1m51s. Vercel reported the exact merge
  commit deployed successfully to Production.
- The generated production deployment URL returned the expected Vercel-auth 302
  before application routing. No browser login was attempted because the active
  browser identity is Greg's work Vercel account and must not be connected to
  this personal project. GitHub/Vercel exact-commit readback and the live
  rollback-only database verifier are the authoritative production proof.
- That follow-on execution-feedback slice is now implemented as the unreleased
  local candidate documented at the top of this handoff.

Team pass: product/coach architecture and frontend lead owned the intent-first
prescription contract and review hierarchy; the main session implemented the
backend, deterministic kernel, migration, and UI. The reviewer pass tightened
equipment semantics, eliminated vacuous assessment/no-running tests, checked
the definer-RPC authority and stale-base behavior, reset proposal idempotency at
acceptance/replacement boundaries, and preserved compatibility with older
stored prescriptions. Vitest, TypeScript, lint, build, and browser
checks supplied verification. Separate delegation was skipped because Greg did
not request it.

Bead `Fitness-Tracker-ofn` is complete after this release-record update lands.

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

- Released through PR #40 as merge commit `e4b133d`. Exact-commit PR CI, the
  Vercel preview, main-branch CI, and the Vercel production deployment all
  passed. The production Supabase migration is applied and verified.
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
  permanently deleted. The same migration was subsequently applied twice and
  rollback-verified in production. Evidence is in
  `docs/migrations/coach-system-verification-2026-07-27.md` and
  `docs/migrations/coach-system-production-application-2026-07-27.md`.
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
- That execution-feedback slice is now implemented as the unreleased local
  candidate documented at the top of this handoff.
- Production release proof: PR CI passed in 1m29s; main CI run `30305928290`
  passed tests, strict TypeScript, lint, and build in 1m51s; Vercel reported the
  production deployment for `e4b133d` successful. Greg confirmed the existing
  production app login succeeds. The protected deployment URL attempted to use
  the browser's active work Vercel identity, so that path was abandoned without
  intentionally connecting the work account. Live plan creation/acceptance was
  not exercised against Greg's real athlete state; atomic behavior was proven
  with the rollback-only production verifier instead.
- Bead `Fitness-Tracker-e17` is complete and may be closed.
