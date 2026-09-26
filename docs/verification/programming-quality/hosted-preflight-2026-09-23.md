# Hosted programming-quality preflight — September 23, 2026

Status: read-only preflight advanced; production release remains blocked.
Operator: Codex through Greg's existing signed-in Supabase dashboard session.
Observation date: September 23, 2026 (UTC).
Candidate inspected: `d555b355366ed22df0f1a754f173414970320d62`, draft PR #84.

## Verified target and recovery

The dashboard identifies `fitness-tracker`, project `auolnfwetmfcwhtvakzy`,
in Personal Projects (`xwwgbkrcafrdaguwayns`), main PRODUCTION, AWS us-east-1,
Free plan. The organization project list contains only this project; no separate
canary was identified there. This does not inventory other organizations.

The project reports no branches and no backups. Its Scheduled Backups page says
“Free Plan does not include project backups.” No provider-managed scheduled
backup is available in that view. An external/manual backup, PITR entitlement,
restore operator, restore test and preservation of post-cutover writes were not
established. Do not interpret this as proof that no external backup exists.

## Live ledger and bounded catalog comparison

Metadata queries used `BEGIN READ ONLY`, a 20-second statement timeout and
`ROLLBACK`. Catalog readback confirmed `transaction_read_only = on` and PostgreSQL
17.6 on aarch64. No athlete rows or application RPCs were read or invoked.
In particular, `get_coach_context_revision()` was not called because it writes.

| Required version | Live ledger name | Result |
| --- | --- | --- |
| 20260915220000 | exercise_preferences | Recorded |
| 20260918010000 | optional_session_feedback | Recorded |
| 20260918011000 | session_capture_signals | Recorded |
| 20260918020000 | capture_receipts | Recorded |
| 20260918030000 | training_intent | Recorded |
| 20260918040000 | targeted_review_sources | Recorded |
| 20260918050000 | recommendations | Recorded |
| 20260921010000 | — | Absent |

An independent agent built the actual `recommendationFixture()` prerequisite
chain before the revision migration in disposable PGlite 0.5.8 / PostgreSQL 18.3
(one local SQL test passed). These six live `pg_get_functiondef` MD5 values match
that baseline after removing only Windows carriage returns where present:

| Function | Live catalog MD5 |
| --- | --- |
| accept_adaptation_proposal | a3c1be2ca1a99f32f5f89ce4138c1f1f |
| assert_coach_review_sources | 4b6d3ce61f785db367f39815a56bdda0 |
| create_initial_rolling_weekly_proposal | c25927d53b94b8c3ed40daca4636475d |
| create_rolling_weekly_replacement_proposal | d9961242f33e6778a5e46aa91e1051b5 |
| guard_coach_proposal_sources | 972cfdb32aa4ec1d9013325001f4773a |
| record_coach_weekly_review | 649dea8398579e8af4bbc591a7044cd0 |

The assert, source-guard and review functions differed in raw local hashes solely
because their local definitions contained CRLF. Removing CR matched the live
hashes exactly; all three live definitions had zero CR characters. The other
three matched without normalization. All six are SECURITY DEFINER with empty
search_path. Effective EXECUTE is granted to authenticated for the four public
entrypoints, and denied to anon/service_role for all six and to authenticated
for the two internal helpers.

All eight new revision helper functions and `coach_context_revisions` are absent.
All 14 existing relations in the release readback list have RLS and FORCE RLS.
Their non-internal trigger counts match the local baseline: memories 4, workouts
2, checkins 2, strength assessments 1, observation groups 5, observation values 4,
imports 4, prescribed sessions 4, programs 2, plan versions 2, proposals 2, reviews
2, review observations 1, source invalidations 1 (36 total). The aggregate UI query
listed imports twice; counts here deduplicate by relation name.

The subsequent [catalog fingerprint query](release-catalog-fingerprints.sql) expanded
the comparison to all public function definitions and five metadata categories
(policies, triggers, constraints, indexes, columns) on each of the 14 relations.
It removes CR, preserves all other definition text, and excludes PostgreSQL 18's
separate NOT NULL constraint rows while retaining column nullability. The same
query semantics passed in the local fixture (one additional SQL test passed).
The [expected fixture fingerprints](release-catalog-baseline-2026-09-23.json) and
[captured hashes and comparison](hosted-catalog-comparison-2026-09-23.json)
show 86 matching application function definitions, including capture and
recommendation overloads; the only unmatched baseline function is its synthetic
`public.uuid_generate_v4` wrapper. Production has 90 public functions, including
four historical functions absent from the fixture: `get_meals_around_workout`,
`get_programming_readiness_context`, `set_user_id`, `update_updated_at_column`.
Their bodies are outside this baseline comparison.

66 of 70 metadata groups match exactly, including every scoped trigger group.
The four differing groups are workout columns, constraints, indexes and policies.
Live readback shows five historical nutrition fields absent from the fixture,
their checks/meal foreign keys, historical indexes, and four authenticated,
owner-scoped completed-workout policies. INSERT/UPDATE/DELETE also exclude
`program_runner`. The fixture instead adds a synthetic owner policy and unique
constraint/index. Independent source review accounts for 28 live columns as
23 fixture columns plus five holistic fields; 14 live constraints as ten fixture
constraints minus the synthetic constraint plus three holistic checks and two
meal foreign keys; and four live policies as five fixture policies minus its
synthetic owner policy. The four real policies match the runner migration.
Twelve live indexes reconcile to six fixture indexes minus its synthetic index
plus seven historical extras. Six extras have repository source provenance; the
standalone `idx_workouts_user_id` has this exact live definition but no source was
found in the bounded migration search:

```sql
CREATE INDEX idx_workouts_user_id ON public.workouts USING btree (user_id)
```

Relevant source locations are `docs/migrations/complete-holistic-migration.sql`
(nutrition columns/checks/foreign keys/indexes), `docs/migrations/supabase-migration.sql`
(initial indexes), `supabase/migrations/20260730130953_coach_workout_runner_v0_5.sql`
(real workout policies) and the agent-context views migration (agent index).
No new revision-migration blocker was found in these differences. The additional
non-unique index is recorded without inventing provenance; do not replay old
migrations to force equality with the simplified fixture.

This remains a bounded match, not full A0 certification: ancillary tables outside
the 14-relation scope and effective grants outside the six inspected entrypoints
are not certified here. Ledger presence alone does not certify every prerequisite
definition. No migration, ledger repair, configuration change, billing change,
production deploy or synthetic production write occurred.

## Next release boundary

The [cutover runbook](release-preflight.md) remains authoritative. The six
September 18 migrations must not be replayed merely because they appeared in an
earlier prerequisite list. The only absent ledger entry in this required subset
is the September 21 revision migration, pending full drift reconciliation.

Before production, establish a recoverable backup with a verified restore path,
then an isolated synthetic PostgreSQL/application target for independent-session
contention and cutover/rollback rehearsal. Existing Preview shares production
database configuration according to the September 22 Vercel readback and cannot
serve as that target. No local PostgreSQL/Docker/Supabase executable was identified
in the prior tool inventory; PGlite is not the independent-session substitute.

A concrete hosted setup candidate is a new empty Supabase project and separate
Vercel project both named `sociusfit-programming-canary`, scoped to synthetic
owners/data and this pinned branch. These are proposed names, not provisioned
resources. Confirm quotas/costs and target-specific provisioning/credential
authority before creation. Alternatively designate an existing isolated target.
Production backup/restore choice remains separate from synthetic canary setup.

For continuing production use, prefer managed daily backups plus a separate
synthetic canary over relying on ad hoc exports alone. Supabase's current
[backup documentation](https://supabase.com/docs/guides/platform/backups) gives Pro
seven days of daily backups and recommends off-site CLI exports for Free projects.
Daily backups do not preserve writes made since the backup and exclude Storage
objects; the release still needs a fresh recovery point and tested write pause.
An upgrade alone is not backup or restore evidence.

The [official billing explanation](https://supabase.com/docs/guides/platform/your-monthly-invoice)
lists a $25/month Pro subscription, $10 compute credit covering one default
project, and at least $10/month for each additional project. Production plus one
default canary in the same Pro organization therefore has an approximately
$35/month Supabase base cost before extra usage/tax; this is an estimate, not a
spending authorization. Vercel cost/eligibility must be checked before provisioning.
A Free-plan route is possible with an eligible free project and a verified manual
backup/restore process, but eligibility and that process are not established here.
No plan upgrade, add-on, credentials or new resource has been purchased/created.

The old production application is incompatible with the new migration's stamped
writer requirement. A tested write pause and compatible rollback/fix-forward
artifact remain required. Keep PR #84 draft and initial-dose activation off.
`Fitness-Tracker-i40.11` remains in progress; this receipt does not close A0.
