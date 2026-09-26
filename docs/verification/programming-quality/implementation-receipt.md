# Programming quality — first local implementation receipt

Date: 2026-09-21. Branch: `codex/programming-quality`. Base: `f123aa8aa848716e894ea7bec340d693995e4b36`.

## Result

The existing programming-context path now gives Socius the selected measured values and complete evidence records through a bounded, owned projection. Individual samples retain units, dates, ordinals, protocol and source verification; whole-record budget omissions and incomplete selection remain explicit. Prompt construction does not restore unselected legacy facts. No numerical policy, retrieval window, schema, accepted plan, or activation behavior changed.

The [offline baseline](baseline-and-rubric.md) contains 24 visible synthetic cases across 19 families: 20 compile and four return explicit blockers. These are characterizations, not coaching-quality passes. The report preserves inputs, outputs and source fingerprints. Sixteen future holdout slots remain unauthored. Greg is the assigned reviewer; rubric adjudication remains outstanding.

Verified current limitations include performed-dose inputs that do not affect prescriptions, outside-training notes that do not affect compiled work, monitoring requests that only add annotations, unsupported ordinary schedule changes, and domain/time constraints. A saved assessment's changed variation also leaves its anchors unchanged in the paired case; this is recorded for policy/eligibility review, not accepted as equivalence.

## Verification

- 125 tests passed across `evidence-reasoning-context`, `socius-prompt`, evidence selection/fetching, planning-context refresh, weekly review/plan, recommendation coach context and passive evidence validity.
- 12 offline baseline characterization tests passed, including the final 24-case roster.
- Full `node node_modules/typescript/bin/tsc --noEmit --incremental false` passed after the dependency environment was corrected; it also passed after the baseline extension.
- Focused ESLint passed on both application files and all changed/new TypeScript test/harness files.
- `git diff --check` passed. Git emits existing LF/CRLF conversion advisories, not whitespace errors.
- Independent software review of the context boundary and final 24-case baseline found no remaining actionable issue. The reviewer separately verified all report source hashes/counts and ran all 12 baseline tests. This is not qualified coaching-policy review or a model-output evaluation.

Dependencies were reused from an existing installation with the identical lockfile, through a worktree-local junction. No package installation or dependency change was made. See the [resolved environment investigation](../../../handoffs/investigations/programming-quality-validation.md).

## Parallel continuation: purpose retrieval, recorded work and review traces

The new read-only evidence tool supports five existing validated purposes. Owner
and as-of time are server supplied; unknown/override fields are rejected. Existing
selection and purpose-window bounds remain authoritative. Partial reads are
explicit, and accepted prescriptions remain in the coach-state tool.

Socius now receives factual performed work when programming context and the
existing history capability are enabled. Planning and chat share the bounded
canonical source reader. A separate projection preserves exact/bounded/unknown
quantities, literal legacy weight, effort scope, corrections and source provenance.
It does not activate the initial-dose policy or change planner familiarity/doses.

The [six signal review cases](signal-review-cases.md) run actual existing evaluator
and compiler paths with synthetic measurements. They demonstrate missing-sensor
sensitivity, unreconciled mixed signals, protocol filtering and the schedule-only
boundary. VBT diagnostic contracts are explicitly harness-only. All coaching
judgments remain pending. The original 24-case baseline is preserved, including
its historical source fingerprints; it was not regenerated after the refactor.

Final combined verification: **278 tests passed across 17 files**, full TypeScript
passed, focused ESLint passed and whitespace validation passed. The integration
test initially revealed a missing `lte` method in the mock query chain; fixing the
mock produced a passing owned-history path. Existing Vite configuration and nested
mock placement warnings remain nonfatal and unchanged in meaning.

Independent engineering review ran 182 relevant tests and found no actionable
issue in ownership, gating, timezone handling, provenance or numerical-authority
boundaries. A separate reviewer checked the six traces against the current code
and ran all seven characterization tests, finding no material issue. These are
synthetic/mocked checks, not live RLS or physiological validation.

## Limits and continuation

### Shared saved-decision continuation

The [readback and freshness slice](decision-readback-and-freshness.md) connects the
existing persisted weekly decision to runtime/chat, weekly GET and Program details.
Its owned projection retains evidence summaries, snapshot references, exclusions,
missingness, exact bounded rationale and proposal state. It explicitly limits
freshness to included review sources. Saved UI actions match the projected
review/proposal identity; refresh clears earlier live responses.

Confirmed dated events linked to active outcomes now reject conflicting direction
target dates with HTTP 409. Both replacement paths refresh intent before applying
the guard. Conflicts prevent proposal writes; the review endpoint may already
have saved the valid review itself before detecting the replacement-date conflict.

Final combined verification is **356 passing tests across 26 files**, full
TypeScript, focused ESLint and whitespace validation. Independent review ran 96
decision/readback/UI/prompt checks, inspected the API regressions, and found no
remaining actionable issue after two integration fixes. UI evidence is component
behavior testing, not browser visual QA. Existing Vite/nested-mock warnings remain.

The later [context revision slice](proposal-context-revisions.md) completes the
local mutation fence in `Fitness-Tracker-i40.3.1`. All rolling drafts and saved
reviews retain a revision captured before source reads; database writes and first
acceptance reject changed revisions. Readback and controls recover from stale
drafts. Accepted replay and accepted JSON are preserved. Its final combined
regression passed **426 tests in 30 files**, full TypeScript, focused ESLint and
whitespace checks. Independent review ran 84 focused tests with no remaining
blocker to this slice. Fifteen executable database tests use PGlite; multi-session
PostgreSQL contention and hosted RLS remain unverified. P2 direction reconciliation
continues in `Fitness-Tracker-i40.3.2`; no numerical policy was activated.

### Remaining scope

This is P0 engineering preparation and a partial P2 delivery. It does not establish full APEX programming, improved model decisions, prompt-injection resistance, persisted proposal readback, hosted behavior, or better training outcomes. No app deployment, live athlete write, paid call, commit or push occurred.

Beads `Fitness-Tracker-i40.1` and `i40.3` remain in progress. The next numerical work retains `qsp → u5l.6 → u5l.11` review/verification requirements; deployment retains A0–A3. See the [task handoff](../../../handoffs/programming-quality.md) and [accepted QPlan](../../plans/coaching-programming-quality.md).
