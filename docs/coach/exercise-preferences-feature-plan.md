# Exercise preferences in coaching

Status: approved and implemented locally, 2026-09-15. Migration and production enablement pending. See ADR-0014 and exercise-preferences-release.md for evidence and rollout boundaries.

## Recommendation

Collect optional favorite exercises and broader training interests once, store them in existing confirmed coach memory, and use them to choose among suitable programming options. Let athletes review and change them later. Enjoyment is separate from proficiency, equipment, and performance goals.

Complexity: level 3, spanning intake, versioned memory, composition, and review UI. Confidence is high for supported specific movements; broader interests require explicit mappings and clear support limits.

## Current evidence

- `app/program/coach-program-components.tsx` has a combined constraints/preferences text field; it does not collect structured favorites.
- `app/lib/coach/complete-intake.ts` initializes profile preferences to an empty array.
- `app/api/coach/intake/route.ts` saves goal, schedule, equipment, and constraint memories through sequential idempotent RPC calls; it has no preference write.
- `app/lib/coach/exercise-preferences-context.ts` consumes confirmed single-movement `prefer`/`avoid` memories and identifies unresolved preferences. The evidence selector governs current versions and confirmation.
- `app/lib/coach/session-composer.ts` already rewards preferred candidates and excludes avoided candidates.
- `app/api/coach/trust/route.ts` supports versioned memory correction, but its content allowlist currently excludes preferences. Collection alone would leave an incomplete correction flow.
- `docs/coach/coaching-playbook.md` already places preferences within athlete context and exercise selection. The architecture map identifies coach memory as canonical state and accepted plans as immutable.

## Athlete experience

Ask during program setup: **“Which exercises or lifts do you enjoy and want to keep in your training?”**

Use a compact optional search/add field with selectable movement or interest suggestions and the ability to keep the athlete's own wording. Offer “No preference” and “Skip for now.” Missing input means unknown; explicit no preference is remembered. Do not require ranking or a long questionnaire. Keep restrictions and avoided movements separate from this positive question.

When preferences are known, display the saved choices with an Edit action. Do not require another confirmation on every plan. A new or changed answer is confirmed when the athlete saves it. Provide the same editor from the existing coach trust surface.

Ask about a particular variation or current capability only when the answer changes a proposed prescription. For example, enjoying muscle-ups does not establish that the athlete can perform them, or that muscle-ups are a performance goal. An interest in handstand movements need not immediately trigger a questionnaire about every variation.

Draft review shows a short explanation where a preference influenced selection. For an unsupported or unsuitable favorite, explain the actual limitation. Do not promise inclusion every week, or describe generic pulling work as muscle-up programming.

## Alternatives

| Approach | Benefits | Costs and failure modes |
| --- | --- | --- |
| Specific catalog selections only | Smallest change; existing deterministic behavior; straightforward validation | Cannot faithfully capture Olympic lifting or broad gymnastics interests; catalog gaps constrain athlete expression |
| Free-text favorites interpreted by the LLM each time | Flexible language; fast initial UI | Repeated interpretation, variable mappings, extra model dependency, and potential confusion between interest and skill; correction is harder to audit |
| Structured selections plus preserved interests — recommended | Existing exact-movement behavior plus honest capture of broader interests; reproducible interpretation and correction | Adds a versioned preference contract and curated family mapping; requires both deterministic and strategy integration |

All options must use existing owned memory and accepted-plan boundaries. The recommended approach adds no service or production dependency. Choose catalog-only if an intentionally narrow release is needed; do not use model interpretation as the sole authority for executable movement eligibility.

## Data and decision contract

Introduce a shared versioned `exercise_preferences` content contract in a focused preference module. Store it as one confirmed preference memory snapshot under a stable key, using existing provenance, version, correction, withdrawal, and idempotency mechanisms. Do not add a competing favorites table.

Proposed content includes `schemaVersion`, explicit `none` or `specified` state, and bounded entries. Each entry preserves `athleteWording` and has one target: a canonical movement ID, a curated interest ID, or unresolved text. Start with at most 12 entries and 160 characters per entry; validate these limits consistently in UI and API. Omitted/skipped input creates no replacement and never clears existing choices. Explicit no preference creates a new confirmed snapshot with no entries.

Keep existing single-movement memories readable. Normalize both formats into one effective planning view. The latest valid confirmed snapshot governs positive favorites when present; legacy avoidance memories remain authoritative. Withdrawal or expiry must not resurrect superseded positive choices silently. If current evidence selection cannot provide these semantics, extend that boundary with tests before shipping. No destructive backfill is planned.

Curated family mappings are versioned and expand only to appropriate supported candidates. Deduplicate overlap so selecting a family and one member does not double the preference bonus. Unresolved text remains visible as an interest, not invented executable authority. Preference text is athlete data, never model instructions.

Planning order: apply restrictions, avoidance, equipment, demonstrated capability, goal/role suitability, and time constraints; then use preference to choose among remaining suitable candidates. Reuse the existing bounded preference score. Do not automatically add volume, change goals, or create a skill block solely because an interest exists. Avoidance wins if a favorite conflicts; surface the conflict for correction without programming the avoided movement.

The strategy brief carries confirmed preferences with evidence IDs and interpretation status. The compiler independently enforces eligibility. Existing supported specific favorites work even when the experimental LLM strategy is disabled. A preference edit affects future drafts; changing an accepted plan still requires a reviewed proposal and acceptance.

## Ordered implementation

1. **Contract and ownership.** Add shared validation/normalization; extend intake types and planning context compatibly. Write an ADR for the snapshot and legacy reconciliation rules. Verify existing RPC and RLS support for the content contract; use an additive migration only if required. Cover missing, none, specified, duplicate, legacy, superseded, expired, and withdrawn states.
2. **Save and correct.** Extend intake memory writes and trust correction validation using the same contract. Keep a preference replacement atomic within one RPC and preserve immutable history. Existing intake writes are not transactionally grouped: on any failure, keep the form and idempotency key, show incomplete save, and retry safely; do not generate a plan from a falsely successful intake. Verify cross-user denial and same-request replay.
3. **Collect and read back.** Add the optional favorites editor to setup and trust review. Prefill confirmed choices and separate favorites from the constraints field. Verify save, reload, edit, clear-to-none, skip, error recovery, and keyboard/mobile operation with 44px targets and 16px inputs. Do not silently migrate ambiguous old prose into structured preferences.
4. **Use preferences end to end.** Normalize exact selections into the existing composer, add reviewed family mappings, and expose unresolved interests and selection reasons. Keep owned preference evidence available to coaching consumers; model-strategy integration is tracked separately and is not shipped with the favorites release. Preserve accepted history and external-coach authority.
5. **Verify and stage.** Run focused intake, trust, context, composer, validator, and strategy regression checks, then typecheck/lint and mobile flow verification. Use a server-controlled rollout gate for new collection/interpretation; disabling it preserves saved memory and accepted plans. Prepare a Preview review before any separately authorized production deployment.

No broad Olympic-lifting or gymnastics catalog expansion is included. Audit each supported family mapping during implementation. Missing movements require a separate prescription-support slice covering metadata, capability requirements, dosage rules, substitution, and domain review. Capturing an interest must remain useful and honest even when its exact prescription is unavailable.

## Acceptance evidence

- Paired synthetic athletes with identical goals and constraints but different suitable favorites receive the expected different exercise choices, with traceable reasons. If another constraint prevents a difference, the explanation identifies it.
- Specific and family selections do not change required coverage or dose merely to satisfy preference, and overlapping entries do not amplify weighting.
- Unknown proficiency, missing equipment, insufficient time, conflicts with avoidance, and unsupported movements produce appropriate omission or decision-relevant clarification, never inferred competence or invented catalog support.
- Correction, explicit none, withdrawal, and expiry remove stale influence according to the contract; skipped intake preserves existing choices. Legacy memories remain supported.
- Auth, ownership, RLS, replay, partial intake failures, refresh, and future-draft behavior pass focused checks. Accepted plans remain byte-for-byte unchanged after preference edits.
- Mobile setup and later editing work without repeated questions or a mandatory questionnaire.
- Strategy evaluation uses synthetic fixtures and checks actual programming differences, not only explanatory text. Paid model evaluations remain paused; report offline checks separately from any later approved live run.

## Boundaries and remaining authority

This feature plan does not resume paused API evaluations, change credentials/routing, deploy, or expand specialist prescription support. Personal examples inform the feature design but are not automatically written to the athlete's live profile or copied into synthetic fixtures.

Local implementation follows the approved plan. Production release, any necessary database deployment, and paid evaluation execution remain separate operational steps. Beads is unavailable in this environment (`bd prime`: command not recognized); this document is the design source, not a replacement issue tracker. Create scoped Beads work items when the tool is available.
