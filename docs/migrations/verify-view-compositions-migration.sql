-- Post-apply verification for view-compositions-migration.sql.
--
-- Run the migration twice before running this script. This verifier requires at
-- least two auth users. It exercises structural, grant, and two-user RLS
-- behavior inside one transaction and rolls all fixtures back.

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
      'View-composition verification requires at least two auth users; found %',
      available_users;
  END IF;

  IF to_regclass('public.view_compositions') IS NULL THEN
    RAISE EXCEPTION 'public.view_compositions does not exist';
  END IF;
END
$verify_prerequisites$;

SELECT set_config(
  'fitness_view_composition_test.user_1',
  (SELECT id::TEXT FROM auth.users ORDER BY id LIMIT 1),
  TRUE
);
SELECT set_config(
  'fitness_view_composition_test.user_2',
  (SELECT id::TEXT FROM auth.users ORDER BY id OFFSET 1 LIMIT 1),
  TRUE
);
SELECT set_config(
  'fitness_view_composition_test.composition_1',
  gen_random_uuid()::TEXT,
  TRUE
);
SELECT set_config(
  'fitness_view_composition_test.composition_2',
  gen_random_uuid()::TEXT,
  TRUE
);

DO $verify_structure$
DECLARE
  rls_state RECORD;
BEGIN
  SELECT relrowsecurity, relforcerowsecurity
  INTO rls_state
  FROM pg_class
  WHERE oid = 'public.view_compositions'::regclass;

  IF NOT rls_state.relrowsecurity OR NOT rls_state.relforcerowsecurity THEN
    RAISE EXCEPTION 'view_compositions must have enabled and forced RLS';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'view_compositions'
      AND column_name IN (
        'id',
        'user_id',
        'view_type',
        'local_date',
        'template_version',
        'template_fingerprint',
        'facts_fingerprint',
        'composition',
        'provider',
        'model',
        'created_at'
      )
  ) <> 11 THEN
    RAISE EXCEPTION 'view_compositions column set is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.view_compositions'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) =
        'UNIQUE (user_id, view_type, local_date, template_version, template_fingerprint, facts_fingerprint)'
  ) THEN
    RAISE EXCEPTION 'view_compositions cache identity constraint is missing';
  END IF;

  IF to_regclass('public.idx_view_compositions_user_day') IS NULL THEN
    RAISE EXCEPTION 'view_compositions user/day index is missing';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'view_compositions'
  ) <> 2 THEN
    RAISE EXCEPTION 'view_compositions must have exactly two RLS policies';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'view_compositions'
      AND policyname IN (
        'Users read own view compositions',
        'Users insert own view compositions'
      )
      AND 'authenticated'::name = ANY (roles)
      AND cmd IN ('SELECT', 'INSERT')
  ) <> 2 THEN
    RAISE EXCEPTION 'view_compositions authenticated policy set is incomplete';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.view_compositions', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.view_compositions', 'INSERT')
    OR has_table_privilege('authenticated', 'public.view_compositions', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.view_compositions', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated view_compositions grants are not least privilege';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.view_compositions', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.view_compositions', 'INSERT')
    OR has_table_privilege('service_role', 'public.view_compositions', 'UPDATE')
    OR has_table_privilege('service_role', 'public.view_compositions', 'DELETE') THEN
    RAISE EXCEPTION 'service_role view_compositions grants are not least privilege';
  END IF;

  IF has_table_privilege('anon', 'public.view_compositions', 'SELECT')
    OR has_table_privilege('anon', 'public.view_compositions', 'INSERT')
    OR has_table_privilege('anon', 'public.view_compositions', 'UPDATE')
    OR has_table_privilege('anon', 'public.view_compositions', 'DELETE') THEN
    RAISE EXCEPTION 'anon must not have view_compositions privileges';
  END IF;
END
$verify_structure$;

-- User 1 can insert and read their own cache row, but cannot insert for user 2.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('fitness_view_composition_test.user_1'),
  TRUE
);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('fitness_view_composition_test.user_1'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

INSERT INTO public.view_compositions (
  id,
  user_id,
  view_type,
  local_date,
  template_version,
  template_fingerprint,
  facts_fingerprint,
  composition,
  provider,
  model
)
VALUES (
  current_setting('fitness_view_composition_test.composition_1')::UUID,
  current_setting('fitness_view_composition_test.user_1')::UUID,
  'dashboard',
  DATE '2099-01-01',
  1,
  repeat('a', 64),
  repeat('b', 64),
  '{"headline":"verification","summary":"user one","highlights":[]}'::JSONB,
  'verification',
  'verification'
);

DO $verify_user_1$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.view_compositions
    WHERE id = current_setting('fitness_view_composition_test.composition_1')::UUID
  ) <> 1 THEN
    RAISE EXCEPTION 'user 1 cannot read their view composition';
  END IF;

  BEGIN
    INSERT INTO public.view_compositions (
      user_id,
      view_type,
      local_date,
      template_version,
      template_fingerprint,
      facts_fingerprint,
      composition,
      provider,
      model
    )
    VALUES (
      current_setting('fitness_view_composition_test.user_2')::UUID,
      'dashboard',
      DATE '2099-01-01',
      1,
      repeat('c', 64),
      repeat('d', 64),
      '{"headline":"blocked","summary":"cross user","highlights":[]}'::JSONB,
      'verification',
      'verification'
    );
    RAISE EXCEPTION 'user 1 inserted a view composition for user 2';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$verify_user_1$;

-- User 2 cannot see user 1's row and can insert and read their own row.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('fitness_view_composition_test.user_2'),
  TRUE
);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('fitness_view_composition_test.user_2'),
    'role', 'authenticated'
  )::TEXT,
  TRUE
);

DO $verify_user_2_visibility$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.view_compositions
    WHERE id = current_setting('fitness_view_composition_test.composition_1')::UUID
  ) THEN
    RAISE EXCEPTION 'user 2 can read user 1 view compositions';
  END IF;
END
$verify_user_2_visibility$;

INSERT INTO public.view_compositions (
  id,
  user_id,
  view_type,
  local_date,
  template_version,
  template_fingerprint,
  facts_fingerprint,
  composition,
  provider,
  model
)
VALUES (
  current_setting('fitness_view_composition_test.composition_2')::UUID,
  current_setting('fitness_view_composition_test.user_2')::UUID,
  'dashboard',
  DATE '2099-01-01',
  1,
  repeat('e', 64),
  repeat('f', 64),
  '{"headline":"verification","summary":"user two","highlights":[]}'::JSONB,
  'verification',
  'verification'
);

DO $verify_user_2$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.view_compositions
    WHERE id = current_setting('fitness_view_composition_test.composition_2')::UUID
  ) <> 1 THEN
    RAISE EXCEPTION 'user 2 cannot read their view composition';
  END IF;
END
$verify_user_2$;

RESET ROLE;
ROLLBACK;

SELECT
  'view_compositions verification passed; fixtures rolled back'
  AS verification_result;
