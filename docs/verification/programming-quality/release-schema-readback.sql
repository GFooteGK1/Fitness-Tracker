-- Metadata only, on an explicitly verified existing connection. No athlete rows.
-- In psql use ON_ERROR_STOP=1. Stop on missing ledger/permissions; do not repair.
-- No application RPCs: get_coach_context_revision() itself INSERTs a row.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

SELECT current_database() AS database_name, current_user AS session_role,
       version() AS postgres_version, current_setting('transaction_read_only') AS read_only;

-- Authoritative presence, not proof of matching file/function contents.
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
WITH required(version) AS (VALUES
  ('20260915220000'), ('20260918010000'), ('20260918011000'),
  ('20260918020000'), ('20260918030000'), ('20260918040000'),
  ('20260918050000'), ('20260921010000')
)
SELECT r.version AS required_version, m.version IS NOT NULL AS recorded, m.name
FROM required r LEFT JOIN supabase_migrations.schema_migrations m ON m.version = r.version
ORDER BY r.version;

-- Missing required relations remain visible. No table contents are read.
WITH required(name) AS (VALUES
  ('coach_context_revisions'), ('coach_memories'), ('workouts'), ('coach_checkins'),
  ('coach_strength_assessments'), ('performance_observation_groups'),
  ('performance_observation_values'), ('measurement_imports'), ('prescribed_sessions'),
  ('training_programs'), ('training_plan_versions'), ('adaptation_proposals'),
  ('coach_weekly_reviews'), ('coach_weekly_review_observations'), ('coach_review_source_invalidations')
)
SELECT r.name, c.oid IS NOT NULL AS present, c.relkind, c.relrowsecurity,
       c.relforcerowsecurity, c.relacl
FROM required r LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = r.name
ORDER BY r.name;

-- Include each overload, including retained entrypoints that rely on new guards.
WITH required(name) AS (VALUES
  ('get_coach_context_revision'), ('advance_coach_context_revision'), ('coach_context_revision_value'),
  ('assert_coach_context_revision'), ('assert_coach_plan_intent_current'),
  ('guard_coach_proposal_context'), ('guard_coach_review_context'), ('expire_stale_coach_context_proposals'),
  ('record_coach_weekly_review'), ('create_rolling_weekly_replacement_proposal'),
  ('create_initial_rolling_weekly_proposal'),
  ('accept_adaptation_proposal'), ('assert_coach_review_sources'), ('guard_coach_proposal_sources')
)
SELECT r.name, p.oid IS NOT NULL AS present, pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer, p.proconfig, p.proacl,
       md5(pg_get_functiondef(p.oid)) AS catalog_definition_md5,
       pg_get_functiondef(p.oid) AS definition
FROM required r LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_proc p ON p.pronamespace = n.oid AND p.proname = r.name AND p.prokind = 'f'
ORDER BY r.name, arguments;

-- Effective grants include role inheritance/PUBLIC, unlike raw ACL alone.
SELECT r.rolname, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       has_function_privilege(r.oid, p.oid, 'EXECUTE') AS may_execute
FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE r.rolname IN ('anon', 'authenticated', 'service_role') AND n.nspname = 'public'
  AND p.proname IN ('get_coach_context_revision', 'advance_coach_context_revision', 'coach_context_revision_value',
    'assert_coach_context_revision', 'assert_coach_plan_intent_current', 'guard_coach_proposal_context',
    'guard_coach_review_context', 'expire_stale_coach_context_proposals', 'record_coach_weekly_review',
    'create_rolling_weekly_replacement_proposal', 'accept_adaptation_proposal')
ORDER BY p.proname, arguments, r.rolname;

SELECT r.rolname, c.relname, privilege,
       has_table_privilege(r.oid, c.oid, privilege) AS granted
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) AS privileges(privilege)
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  AND n.nspname = 'public' AND c.relname = 'coach_context_revisions'
ORDER BY r.rolname, privilege;

SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename IN
  ('coach_context_revisions', 'coach_memories', 'training_plan_versions', 'adaptation_proposals',
   'coach_weekly_reviews', 'coach_weekly_review_observations', 'coach_review_source_invalidations')
ORDER BY tablename, policyname;

-- All existing source triggers are included so lock ordering can be compared.
SELECT c.relname, t.tgname, t.tgenabled, t.tgdeferrable, t.tginitdeferred,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal AND c.relname IN
  ('coach_memories', 'workouts', 'coach_checkins', 'coach_strength_assessments',
   'performance_observation_groups', 'performance_observation_values', 'measurement_imports',
   'prescribed_sessions', 'adaptation_proposals', 'coach_weekly_reviews')
ORDER BY c.relname, t.tgname;

SELECT c.relname, k.conname, k.convalidated, pg_get_constraintdef(k.oid) AS definition
FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN
  ('coach_context_revisions', 'training_plan_versions', 'adaptation_proposals', 'coach_weekly_reviews')
ORDER BY c.relname, k.conname;

SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN
  ('coach_context_revisions', 'coach_memories', 'training_plan_versions', 'adaptation_proposals', 'coach_weekly_reviews')
ORDER BY tablename, indexname;

SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN
  ('coach_context_revisions', 'coach_memories', 'workouts', 'coach_checkins', 'coach_strength_assessments',
   'performance_observation_groups', 'performance_observation_values', 'measurement_imports',
   'prescribed_sessions', 'training_programs', 'training_plan_versions', 'adaptation_proposals', 'coach_weekly_reviews')
ORDER BY table_name, ordinal_position;

ROLLBACK;
