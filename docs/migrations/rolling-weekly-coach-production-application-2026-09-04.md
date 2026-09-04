# Rolling Weekly Coach Production Application

Date: September 4, 2026

Target: Supabase project `fitness-tracker` (`auolnfwetmfcwhtvakzy`) and the
Vercel production project `gregs-projects-98860c8b/fitness-tracker`.

## Result

The rolling-weekly coach is released. The final authenticated production
canary passed the full weekly loop, tenant isolation, response-loss retries,
and dependency-ordered cleanup. No real athlete state was used or changed.

## Source and review chain

The exact original candidate was committed unchanged:

- `44cf0da14f6bf4a4b7a8552456317117e7ae340b` — Add rolling weekly adaptive coach

The release then moved through focused review and canary fixes:

- PR #71 merged the candidate as `8b9db7aca3e4eaa3957c20a8bf5860303ec9f9ef`.
- PR #72 fixed atomic canonical-workout linkage and merged as
  `758b3617dffbc1fc49e2ea9c2f9b40210bc460b7`.
- PR #73 read weekly feedback from canonical `coach_checkins` and merged as
  `415db90683bc512f2738a571e83fe07de6ec0389`.
- PR #74 normalized valid PostgREST timestamp offsets at the stored-check-in
  read boundary and merged as `df26de76fa7cf271131bcac72f85435d602fd353`.
- PR #75 aligned adaptive evidence scope with the canonical `goalId` field and
  merged as `666b50d1428be06dcc75b1378b752714d798001b`.

Every focused fix preserved authentication, RLS, immutable accepted plans,
explicit replacement acceptance, and bounded database write authority.

## Database application

The following additive production migrations are applied:

- `20260903150000_rolling_weekly_coach.sql`
- `20260904023000_fix_atomic_session_workout_link.sql`

Post-application readback showed local and remote migration history aligned
through `20260904023000`. A fresh linked dry run returned no migrations, seed
changes, or role changes. Database lint returned zero errors.

## CI and deployment

The original candidate passed the complete local suite: 227 test files passed,
5 skipped; 2,435 tests passed, 7 skipped. TypeScript, lint, production build,
migration tests, disposable PostgreSQL application, and responsive browser
verification also passed.

Final exact-source gates:

- PR #75 exact-head CI run `33832212256`, job `100897397887`: passed.
- Final merged-main CI run `33832459821`, job `100898139127`: passed tests,
  typecheck, lint, and build.
- Final production deployment: `dpl_BqiCLUhKdZdE4PG5UghWRkv47ZXu`.
- Deployment URL:
  `https://fitness-tracker-hzjnyi4j1-gregs-projects-98860c8b.vercel.app`.
- Status and target: Ready, production.
- Production aliases include `https://www.sociusfit.com`,
  `https://sociusfit.com`, and `https://sociusai.vercel.app`.
- Health readback at `2026-09-04T03:19:41.355Z`: healthy; database connected;
  auth configured.

## Authenticated production canary

Canary run `1788491899096-ea853ee5` used two uniquely tagged synthetic auth
users. The workflow proved:

- the initial proposal retry returned the same proposal and plan;
- Athlete B could not accept Athlete A's initial proposal;
- initial acceptance replayed without changing the active plan;
- two prescribed sessions created exactly two canonical workouts and two
  canonical check-ins;
- session-completion replay returned the same workout and check-in;
- three observation groups were stored: two session-RPE groups and one typed
  strength training signal;
- the immutable weekly review selected `collect_signal` from insufficient
  repeated evidence;
- review and next-proposal retry returned the same review, proposal, and plan;
- the adjacent Week 2 proposal required explicit acceptance and did not
  silently activate;
- Week 2 acceptance replayed without changing its plan;
- Athlete B read zero Athlete A rows across eight protected tables;
- Athlete B could not accept Athlete A's Week 2 proposal.

Final pre-cleanup counts for Athlete A were one program, two plan versions,
two proposals, one weekly review, three review-observation links, four
prescribed sessions, two check-ins, two workouts, and three observation groups.

Cleanup detached the active-plan pointer and deleted dependent rows in foreign-
key order before deleting both auth users. Independent readback returned zero
rows for `coach_weekly_review_observations`, `performance_observation_values`,
`performance_observation_groups`, `coach_checkins`, `adaptation_proposals`,
`coach_weekly_reviews`, `prescribed_sessions`, `training_plan_versions`,
`training_programs`, and `workouts`, plus zero remaining auth users.

Earlier diagnostic canary runs also used uniquely tagged synthetic users and
completed the same zero-row cleanup. They exposed the atomic workout metadata,
canonical check-in table, stored timestamp, and adaptive goal-field issues that
were fixed in PRs #72 through #75.

## Rollback

Use an application-first, data-preserving rollback:

1. Reassign the production aliases to the prior known-good Vercel deployment.
2. Keep the additive rolling-week schema and recorded athlete data in place.
3. Disable the rolling UI/API entry points if a longer investigation is needed.
4. Do not delete accepted plans, reviews, workouts, check-ins, observations, or
   proposal history as part of an application rollback.
5. Use the rollback-only SQL verifier only in a disposable or explicitly
   approved environment. Do not use it as a production data-deletion script.

## Operational note

During a read-only CLI lookup for the canary, the Supabase CLI unexpectedly
rendered legacy project API key material in the private tool transcript. No key
value was copied into source, documentation, the canary output, or Beads.
Rotation is a separate credential operation and was not performed in this
release.
