# Effort-led prescriptions and actual RIR — local storage proof

Canonical task: `Fitness-Tracker-u5l.11.1`, reused by the approved supervised first milestone `Fitness-Tracker-i40.17`. Task remains in progress for browser proof of the new extension. No coaching approval, hosted readiness or numerical activation is inferred.

## Implementation

Schema3 effort-led prescriptions retain their exact targets, preparation, optional tail and conditional time accounting. Actual report schema2 requires independent nullable `rir`; old schema1 reports and uncertain pending requests retain their exact keys. New forms leave RIR unknown rather than deriving it from RPE. Skipped work clears actual quantities. Completion classifies effort repetitions as STRENGTH and carries the athlete's RIR through the saved workout and factual context. ADR-0034 records the contract.

The additive migration `20260929010000_reviewed_effort_rir.sql` preserves existing completion owner, active-plan, replay, request-resolution, ACL and timeout behavior. Independent review compared its completion definition against the prior migration and found only the two intended semantic changes: strength classification and independent RIR projection.

## Verification

- Focused combined run: 144 tests passed, four expected skips across six loaded test files. Includes disposable SQL lifecycle, strict report validation, rendered session form and factual-context preservation. The effort-only checks are intentionally skipped for two non-effort fixture variants.
- Full nonincremental TypeScript and scoped lint of the new real-local runner passed. PowerShell parser check passed for the extended migration wrapper.
- Independent pre-application review found no material blocker in migration/wrapper; separate runner review cleared local-target boundaries, retained identities/requests and assertion coverage.
- Real retained Auth/PostgREST run `33fd868d-2c74-4e9b-a393-b523a629aa4d` passed all45 checks on September29. Receipt: `output/app-quality-release/reviewed-effort-rir-33fd868d-2c74-4e9b-a393-b523a629aa4d/receipt.json`.

The real run covers authenticated source/registration, exact issuance and acceptance/replay, immutable original base, exact schema3 readback, independently recorded RIR2.5 with RPE7, append-only correction to RIR1.5 without changing RPE, original-request recovery, conflicting payload refusal, explicit no-write fencing, skipped optional work, completion/replay, exactly one workout and foreign-account denial. It uses a deliberately mechanical fixture, not Greg's program or an approved new home week.

Runner source SHA256 at execution: `a444ce2a49787cfe5941f01095fd712122b443eb08d329e4aacef0fa860de56a`.
The runner retains exact mutation payloads and synthetic identities before writes, refuses an existing run directory and never automatically reseeds/resumes a failed run. Passwords/tokens remain in memory. No fixture cleanup/deletion occurred.

## One local migration

Applied once through `apply-local-reviewed-set-migration.ps1 -Stage EffortRir` after the loopback-only stack and dedicated container label were verified. No reset/bootstrap replay.

- Migration SHA256: `8406d796120a4af4b06e99916364f42592336828b6c0ab2ca191ce992f35775d`.
- Pre-application constraint MD5: `bfb306b6629ee2a35e445458399017d8`.
- Report-validator definition MD5: `bdfed7a50d4f1ee48119002e89fd26f2`.
- Completion-definition MD5: `b4a382d53464426d7842fb1ed6a1383e`.
- Migration log: `output/app-quality-release/reviewed-set-migration-3ba5af3a-bb89-45a5-8fe1-eb507ad9de90.log`.

Exact prior fingerprints reject unexpected state or replay. One transaction, bounded timeouts and locked before/after digests proved these existing tables unchanged at application: 2,982 prescribed sessions;775 plan versions;364 adaptation proposals;1,120 set reports;143 workouts. Fresh synthetic test records were created afterward and retained.

## Actual Next and browser verification

On September29 the actual application ran in isolated Next runtime
`b548726c-0165-4bf2-aa8a-b1ccddc52cc9` at `127.0.0.1:3013`, connected only to the
retained loopback Supabase stack. Preparation `c0669c85-6c43-43cb-ad25-e23477f60a42`
reused the successful original athlete and program and pinned a mechanical
next-week registry. Preparation changed no training rows. Independent review
caught and cleared an original-identity provenance mismatch before execution.

The browser first confirmed the canonical default-off behavior (409, reviewed
programming unavailable). Only the generated runtime copy was enabled. Through
the actual application pages, the original athlete prepared and accepted the
adjacent week, saved24 actual reps with RPE7 and RIR2.5, corrected only RIR to1.5,
recorded the optional left working set as not performed, and completed the
session as modified. Unreported work stayed unknown. Reload showed completed,
read-only state. These are deliberately mechanical transport values, not a
coaching recommendation or a new accepted athlete week.

Fresh authenticated readback passed all20 assertions in
`reviewed-next-b548726c-0165-4bf2-aa8a-b1ccddc52cc9/effort-readback.json` under
`output/app-quality-release`. It verifies exact accepted content, preserved
original week/session/workout, append-only correction, exactly one new workout,
zero performed volume from omitted work and foreign-owner denial. Browser
session: `85db1626-59fc-4f78-bd09-68c647f2e75a`; new workout:
`e93c02ec-7f53-48b4-91ee-65bed5dd81e0`. Do not rerun/reseed these completed receipts.

Browser inspection exposed a saved-summary omission: RIR was stored and restored
by the correction form but absent from the visible saved row. The runner now
shows RIR independently alongside RPE; null/legacy values remain unknown, with
zero and fractions preserved. All15 runner tests and scoped lint passed. The
same runtime received a hash-recorded runner-only refresh; browser reload showed
`24 reps · RPE 7 · RIR 1.5 · rest unknown seconds` and the omitted row separately.
Refreshed runner SHA256:
`0ca99e22bef71fe123de8e2061f2a9d0236c00ebecd99333a0c595838c728214`.

Initial first-load hydration had not completed; a reload resolved the inactive,
unstyled page before any training mutation. A non-elevated generated-file refresh
hit EPERM; the same exact hash-guarded operation succeeded with filesystem
approval. Neither condition caused fixture reseeding or repeated training writes.

## Remaining boundary

This establishes the effort/RIR extension through a real local Next/browser and
Auth/PostgREST lifecycle. It does not establish the named-athlete supervised
pilot, production behavior, or two qualified athlete review cycles.

Global numerical capability remains false; production registry remains empty. No hosted change, model call, commit or push occurred. Broader milestone work includes a practical review/registration process, a named suitable athlete/base, two successive cycles, scoped quality/access and authorized pilot release.
