# Changed training direction: local verification

Date: 2026-09-21. Task: `Fitness-Tracker-i40.3.2`.

## Result

Fresh weekly review now compares latest owned intent and supported setup with the accepted week. A supported change produces a confirmable replacement direction, including schedule or event changes within unchanged domain allocations. Unresolved or unsupported input produces a saved explanation and correction path. Accepted prescriptions remain unchanged until a separate proposal is accepted.

The reconciliation helper reads the latest goal, schedule, equipment, constraint and training-intent records with ownership and lifecycle checks. Confirmed intent controls outcomes and priority. Matching allocation choices survive; a new confirmation requires a new binding even when its semantic goal is unchanged. Replacement setup is prefilled but always needs acknowledgement.

The original accepted profile remains the review basis. Changed direction is explicitly insufficient evidence for numerical adaptation; old goal evaluations are held and safety remains dominant. Saved rationale carries bounded reconciliation metadata into the existing shared decision projection. Full current intent is omitted from that readback projection.

Saving setup precedes a fresh review and proposal. Completed review attempts reset idempotency keys. Live controls require the exact eligible review/proposal pair and never recover an older saved pending proposal behind a blocked live review. Saved-review requests preserve the original revision stamp and reject changed direction rather than renewing an old decision.

## Verification

- Combined regression: **494 tests across 31 files passed**, covering context, provenance, prompts/tools, history, weekly evaluation/compiler, API, UI, saved decisions, baseline/traces and database fences.
- Full TypeScript, focused ESLint and whitespace validation passed.
- Independent review found no remaining production blocker after reviewing canonical authority, safety, acknowledgement, event removal, proposal identity and retry recovery. It independently ran **71 helper/evaluator/compiler tests across 3 files**.
- The changed-schedule API test runs the real reconciler, evaluator and compiler, verifies the new schedule and unchanged accepted week, and captures the revision-bound RPC payload.
- API tests cover event removal through both routes and missing/false acknowledgement with the intent feature disabled. Event removal keeps `direction.goalTargetDate` and confirmed event null while preserving the internal outcome's valid planning horizon.
- UI tests cover blocked/mismatched/matching live proposal identities, no saved fallback, fresh keys after a completed blocked review, and setup-save failure/recovery.
- Saved-decision tests cover all blocked states, changed metadata, bounds, malformed data, immutable input and omission of full intent from prompt context.

## Limits and remaining work

All evidence is local and synthetic/mocked, except the local PGlite transaction tests. No browser visual review, authenticated athlete test, hosted migration, deployment, model call or physiological validation occurred. PGlite tests do not prove real multi-session lock contention.

The prior additive revision migration remains required before deploying these routes. No new migration was introduced here. `initialDosePolicy: false` remains unchanged. Current setup-memory expiry is a read-time check, while canonical intent retains its separate database validity check.

More than three active domains and unenforced free-text constraints remain explicit boundaries. This step does not add whole-week strategy search, fixed VBT monitoring sets, new numerical policies or comparative coaching-quality proof. P2 stays open for its remaining contract/evidence audit; P3 and the separate policy-review work remain pending.
