-- Post-apply verification for:
--   - personal-records-migration.sql
--   - view-templates-migration.sql
--
-- Run both migrations twice before running this script. The second apply proves
-- idempotence. This verifier requires at least two auth users. It creates test
-- rows inside one transaction, exercises the policies as each authenticated
-- user, and rolls everything back. No verification fixtures are persisted.

BEGIN;

DO $verify_prerequisites$
DECLARE
  available_users INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO available_users
  FROM (
    SELECT id
    FROM auth.users
    ORDER BY id
    LIMIT 2
  ) AS users;

  IF available_users < 2 THEN
    RAISE EXCEPTION
      'Migration verification requires at least two auth users; found %',
      available_users;
  END IF;

  IF to_regclass('public.personal_records') IS NULL THEN
    RAISE EXCEPTION 'public.personal_records does not exist';
  END IF;

  IF to_regclass('public.view_templates') IS NULL THEN
    RAISE EXCEPTION 'public.view_templates does not exist';
  END IF;
END
$verify_prerequisites$;

-- Store fixture identities before assuming the authenticated role. Transaction-
-- local custom settings remain available after role changes and disappear at
-- ROLLBACK.
SELECT set_config(
  'fitness_migration_test.user_1',
  (SELECT id::TEXT FROM auth.users ORDER BY id LIMIT 1),
  TRUE
);
SELECT set_config(
  'fitness_migration_test.user_2',
  (SELECT id::TEXT FROM auth.users ORDER BY id OFFSET 1 LIMIT 1),
  TRUE
);
SELECT set_config('fitness_migration_test.pr_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('fitness_migration_test.pr_2', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('fitness_migration_test.template_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('fitness_migration_test.template_2', gen_random_uuid()::TEXT, TRUE);
SELECT set_config(
  'fitness_migration_test.template_version_1',
  (
    SELECT (COALESCE(MAX(version), 0) + 1)::TEXT
    FROM public.view_templates
    WHERE user_id = current_setting('fitness_migration_test.user_1')::UUID
      AND view_type = 'dashboard'
  ),
  TRUE
);
SELECT set_config(
  'fitness_migration_test.template_version_2',
  (
    SELECT (COALESCE(MAX(version), 0) + 1)::TEXT
    FROM public.view_templates
    WHERE user_id = current_setting('fitness_migration_test.user_2')::UUID
      AND view_type = 'dashboard'
  ),
  TRUE
);

DO $verify_structure$
DECLARE
  personal_records_rls RECORD;
  view_templates_rls RECORD;
BEGIN
  SELECT relrowsecurity, relforcerowsecurity
  INTO personal_records_rls
  FROM pg_class
  WHERE oid = 'public.personal_records'::regclass;

  IF NOT personal_records_rls.relrowsecurity
    OR NOT personal_records_rls.relforcerowsecurity THEN
    RAISE EXCEPTION 'personal_records must have enabled and forced RLS';
  END IF;

  SELECT relrowsecurity, relforcerowsecurity
  INTO view_templates_rls
  FROM pg_class
  WHERE oid = 'public.view_templates'::regclass;

  IF NOT view_templates_rls.relrowsecurity
    OR NOT view_templates_rls.relforcerowsecurity THEN
    RAISE EXCEPTION 'view_templates must have enabled and forced RLS';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'personal_records'
      AND policyname IN (
        'Users can view their own PRs',
        'Users can insert their own PRs',
        'Users can delete their own PRs'
      )
      AND 'authenticated'::name = ANY (roles)
  ) <> 3 THEN
    RAISE EXCEPTION 'personal_records policy set is incomplete';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'view_templates'
      AND policyname IN (
        'Users can view their templates and defaults',
        'Users can create their own template versions'
      )
      AND 'authenticated'::name = ANY (roles)
  ) <> 2 THEN
    RAISE EXCEPTION 'view_templates policy set is incomplete';
  END IF;

  IF NOT has_table_privilege(
    'authenticated',
    'public.personal_records',
    'SELECT'
  ) OR NOT has_table_privilege(
    'authenticated',
    'public.personal_records',
    'INSERT'
  ) OR NOT has_table_privilege(
    'authenticated',
    'public.personal_records',
    'DELETE'
  ) OR has_table_privilege(
    'authenticated',
    'public.personal_records',
    'UPDATE'
  ) THEN
    RAISE EXCEPTION 'authenticated personal_records grants are incorrect';
  END IF;

  IF NOT has_table_privilege(
    'service_role',
    'public.personal_records',
    'SELECT'
  ) OR NOT has_table_privilege(
    'service_role',
    'public.personal_records',
    'INSERT'
  ) OR NOT has_table_privilege(
    'service_role',
    'public.personal_records',
    'DELETE'
  ) OR has_table_privilege(
    'anon',
    'public.personal_records',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'personal_records service/anon grants are incorrect';
  END IF;

  IF NOT has_table_privilege(
    'authenticated',
    'public.view_templates',
    'SELECT'
  ) OR NOT has_table_privilege(
    'authenticated',
    'public.view_templates',
    'INSERT'
  ) OR has_table_privilege(
    'authenticated',
    'public.view_templates',
    'UPDATE'
  ) OR has_table_privilege(
    'authenticated',
    'public.view_templates',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'authenticated view_templates grants are incorrect';
  END IF;

  IF NOT has_table_privilege(
    'service_role',
    'public.view_templates',
    'SELECT'
  ) OR NOT has_table_privilege(
    'service_role',
    'public.view_templates',
    'INSERT'
  ) OR has_table_privilege(
    'anon',
    'public.view_templates',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'view_templates service/anon grants are incorrect';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.view_templates
    WHERE user_id IS NULL
      AND view_type = 'dashboard'
      AND version = 1
      AND schema_version = 1
      AND template->>'schemaVersion' = '1'
  ) <> 1 THEN
    RAISE EXCEPTION 'dashboard default template v1 is missing or duplicated';
  END IF;
END
$verify_structure$;

-- User 1 can create and read their own rows, but cannot create rows for user 2.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('fitness_migration_test.user_1'),
  TRUE
);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('fitness_migration_test.user_1'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

INSERT INTO public.personal_records (
  id,
  user_id,
  exercise,
  pr_type,
  value
)
VALUES (
  current_setting('fitness_migration_test.pr_1')::UUID,
  current_setting('fitness_migration_test.user_1')::UUID,
  '__migration_rls_verify_user_1__',
  'weight',
  100
);

DO $verify_user_1_pr$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.personal_records
    WHERE id = current_setting('fitness_migration_test.pr_1')::UUID
  ) <> 1 THEN
    RAISE EXCEPTION 'user 1 cannot read their personal record';
  END IF;

  BEGIN
    INSERT INTO public.personal_records (
      id,
      user_id,
      exercise,
      pr_type,
      value
    )
    VALUES (
      gen_random_uuid(),
      current_setting('fitness_migration_test.user_2')::UUID,
      '__migration_rls_verify_cross_user__',
      'weight',
      101
    );
    RAISE EXCEPTION 'user 1 inserted a personal record for user 2';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_user_1_pr$;

INSERT INTO public.view_templates (
  id,
  user_id,
  view_type,
  version,
  schema_version,
  template
)
VALUES (
  current_setting('fitness_migration_test.template_1')::UUID,
  current_setting('fitness_migration_test.user_1')::UUID,
  'dashboard',
  current_setting('fitness_migration_test.template_version_1')::INTEGER,
  1,
  '{"schemaVersion":1,"tone":"concise","showNarrative":true,"sections":[]}'::JSONB
);

DO $verify_user_1_template$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.view_templates
    WHERE id = current_setting('fitness_migration_test.template_1')::UUID
  ) <> 1 THEN
    RAISE EXCEPTION 'user 1 cannot read their view template';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.view_templates
    WHERE user_id IS NULL
      AND view_type = 'dashboard'
      AND version = 1
  ) <> 1 THEN
    RAISE EXCEPTION 'user 1 cannot read the default view template';
  END IF;

  BEGIN
    INSERT INTO public.view_templates (
      id,
      user_id,
      view_type,
      version,
      schema_version,
      template
    )
    VALUES (
      gen_random_uuid(),
      current_setting('fitness_migration_test.user_2')::UUID,
      'dashboard',
      current_setting('fitness_migration_test.template_version_2')::INTEGER,
      1,
      '{"schemaVersion":1,"tone":"concise","showNarrative":true,"sections":[]}'::JSONB
    );
    RAISE EXCEPTION 'user 1 inserted a view template for user 2';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_user_1_template$;

-- User 2 cannot see or delete user 1's rows, and can manage their own PR row.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('fitness_migration_test.user_2'),
  TRUE
);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('fitness_migration_test.user_2'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

DO $verify_user_2_visibility$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.personal_records
    WHERE id = current_setting('fitness_migration_test.pr_1')::UUID
  ) THEN
    RAISE EXCEPTION 'user 2 can read user 1 personal records';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.view_templates
    WHERE id = current_setting('fitness_migration_test.template_1')::UUID
  ) THEN
    RAISE EXCEPTION 'user 2 can read user 1 view templates';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.view_templates
    WHERE user_id IS NULL
      AND view_type = 'dashboard'
      AND version = 1
  ) <> 1 THEN
    RAISE EXCEPTION 'user 2 cannot read the default view template';
  END IF;
END
$verify_user_2_visibility$;

INSERT INTO public.personal_records (
  id,
  user_id,
  exercise,
  pr_type,
  value
)
VALUES (
  current_setting('fitness_migration_test.pr_2')::UUID,
  current_setting('fitness_migration_test.user_2')::UUID,
  '__migration_rls_verify_user_2__',
  'reps',
  10
);

DO $verify_user_2_pr$
DECLARE
  affected_rows INTEGER;
BEGIN
  DELETE FROM public.personal_records
  WHERE id = current_setting('fitness_migration_test.pr_1')::UUID;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows <> 0 THEN
    RAISE EXCEPTION 'user 2 deleted user 1 personal record';
  END IF;

  DELETE FROM public.personal_records
  WHERE id = current_setting('fitness_migration_test.pr_2')::UUID;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'user 2 could not delete their personal record';
  END IF;
END
$verify_user_2_pr$;

INSERT INTO public.view_templates (
  id,
  user_id,
  view_type,
  version,
  schema_version,
  template
)
VALUES (
  current_setting('fitness_migration_test.template_2')::UUID,
  current_setting('fitness_migration_test.user_2')::UUID,
  'dashboard',
  current_setting('fitness_migration_test.template_version_2')::INTEGER,
  1,
  '{"schemaVersion":1,"tone":"encouraging","showNarrative":true,"sections":[]}'::JSONB
);

DO $verify_user_2_template$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.view_templates
    WHERE id = current_setting('fitness_migration_test.template_2')::UUID
  ) <> 1 THEN
    RAISE EXCEPTION 'user 2 cannot read their view template';
  END IF;
END
$verify_user_2_template$;

RESET ROLE;
ROLLBACK;

-- Success means every statement completed and the transaction rolled back.
