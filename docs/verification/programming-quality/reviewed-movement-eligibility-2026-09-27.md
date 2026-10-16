# Reviewed movement and equipment eligibility

September 27 Chicago / September 28 UTC. Canonical task `Fitness-Tracker-u5l.6.10`.

Trusted reviewed recipes now pass canonical movement, equipment, experience and
athlete-constraint checks, including preparation. Exact reviewed identifiers are
resolved without transferring loads, assessments or monitoring protocols.

The 20 source identities use five existing canonical identities, `bike` mapped
to `bike_erg`, and 14 passive reviewed identities (including `run` mapped to
`reviewed_run`). New identities cover high-handle trap bar, chest-supported row,
triceps pressdown, pull-up, band pull-apart, scapular push-up, bodyweight squat,
hinge and calf raise, walking lunge, A-march, A-skip, running and walking.
They remain `evidence_only`, outside default generation and substitution groups.
Generic reviewed running has no inferred fitness coverage: the accepted activity
protocol distinguishes acceleration, upright running, intervals and preparation.
Active catalog entries still require coverage and compatible substitutions.

Detailed equipment requirements remain literal and mandatory. Canonical mapping
does not infer safeties from a rack, runout from a track, high handles from a
generic trap bar, or equipment from a full-gym description. Explicit running
avoidance applies across the existing and reviewed running identities. Unknown
setup, missing equipment and insufficient experience fail eligibility. A matching
assessment name cannot waive setup or skill requirements.

The special performed-evidence mapping requires an unchanged, valid version-3
reviewed completion. Raw names, quantities and protocol references survive.
Amended evidence falls back to existing factual normalization and requires review.
`reviewed-dose-context-2` binds `reviewed-identities-0.1.0`, invalidating earlier
registrations without changing the historical active catalog version.

## Verification

- Final regression run: 210 tests across 11 suites passed, including reviewed
  recipes, canonical catalog, eligibility counterfactuals, factual evidence,
  authenticated context, validation, composer and rolling plans.
- Full current-source TypeScript and focused ESLint passed.
- Independent review passed 117 tests; final taxonomy recheck passed 43 tests
  across five suites with no blockers.
- Real loopback Auth/PostgreSQL full-week run
  `f3e6282f-3993-49fb-86e6-1b45f58dc467`: 53 checks, 105 exact latest reports,
  250,837 record characters. Every canonical identity and raw name matched its
  source; all actual quantities and protocol references remained intact.
- Local week run `3ee55e6f-9df6-4b6a-9d66-2b17f5ca12c4`: 48 checks.
  Local session run `11154215-85e0-4b80-b5cd-75397e5e68d2`: 24 checks.
  Receipts are under `output/app-quality-release/reviewed-dose-<runId>/receipt.json`.
  Final taxonomy-only refinements were verified by regression and independent
  checks after these local runs; they change no stored record fields.

## Resolved findings

Independent review caught running-avoidance alias coverage and inherited pull-up/
bilateral-hinge taxonomy. These are corrected. Final inspection also removed
horizontal-pull coverage from band pull-apart and inferred aerobic coverage from
generic reviewed running.

Initial typecheck traversed retained release copies in `output/` against current
source types. Excluding generated `output` in tsconfig restored current-source
checking without editing retained evidence. One regression incorrectly expected
amended raw `run` to normalize to null; existing exact display-name normalization
correctly yields `easy_run`. The assertion now preserves that legacy behavior;
all 210 tests passed on rerun.

No migration, hosted write or numerical activation occurred. Changes remain local
and uncommitted. W5 remains open for trusted numerical proposal/source-current
atomic acceptance and route/UI lifecycle; W10 and broader release gates remain.
Canonical `.10` is closed; `.11` tracks trusted proposal and atomic acceptance.
Board checkpoint delivered/read back at version 74, event
`a87a7564-e59c-42d1-b7b0-02b42dac5b35`.
