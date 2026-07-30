-- Rollback-only verification for secure-legacy-database-objects-migration.sql.
-- Apply the forward migration twice before running this verifier.

BEGIN;

SELECT set_config(
  'legacy_security_verify.recovery_count',
  (SELECT count(*)::TEXT FROM public.whoop_recovery_backup),
  TRUE
);
SELECT set_config(
  'legacy_security_verify.sleep_count',
  (SELECT count(*)::TEXT FROM public.whoop_sleep_backup),
  TRUE
);
SELECT set_config(
  'legacy_security_verify.workout_count',
  (SELECT count(*)::TEXT FROM public.whoop_workouts_backup),
  TRUE
);

DO $verify_backup_table_security$
DECLARE
  backup_table REGCLASS;
BEGIN
  FOREACH backup_table IN ARRAY ARRAY[
    'public.whoop_recovery_backup'::REGCLASS,
    'public.whoop_sleep_backup'::REGCLASS,
    'public.whoop_workouts_backup'::REGCLASS
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class
      WHERE oid = backup_table
        AND relrowsecurity
        AND relforcerowsecurity
    ) THEN
      RAISE EXCEPTION '% must have enabled and forced RLS', backup_table;
    END IF;

    IF has_table_privilege('anon', backup_table, 'SELECT')
      OR has_table_privilege('anon', backup_table, 'INSERT')
      OR has_table_privilege('anon', backup_table, 'UPDATE')
      OR has_table_privilege('anon', backup_table, 'DELETE')
      OR has_table_privilege('authenticated', backup_table, 'SELECT')
      OR has_table_privilege('authenticated', backup_table, 'INSERT')
      OR has_table_privilege('authenticated', backup_table, 'UPDATE')
      OR has_table_privilege('authenticated', backup_table, 'DELETE') THEN
      RAISE EXCEPTION '% remains reachable by a Data API user role', backup_table;
    END IF;

    IF NOT has_table_privilege(
      'service_role',
      backup_table,
      'SELECT,INSERT,UPDATE,DELETE'
    ) THEN
      RAISE EXCEPTION '% lost required service-role maintenance access', backup_table;
    END IF;
  END LOOP;
END
$verify_backup_table_security$;

DO $verify_meal_workout_function_security$
DECLARE
  target_function REGPROCEDURE :=
    'public.get_meals_around_workout(uuid,integer)'::REGPROCEDURE;
BEGIN
  IF has_function_privilege('anon', target_function, 'EXECUTE')
    OR has_function_privilege('authenticated', target_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_meals_around_workout remains publicly executable';
  END IF;

  IF NOT has_function_privilege('service_role', target_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'get_meals_around_workout lost service-role execution';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = target_function
      AND prosecdef
  ) THEN
    RAISE EXCEPTION 'get_meals_around_workout must remain security invoker';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = target_function
      AND array_to_string(proconfig, ',') ~ '^search_path=(""|)$'
  ) THEN
    RAISE EXCEPTION 'get_meals_around_workout must use an empty search_path';
  END IF;
END
$verify_meal_workout_function_security$;

SET LOCAL ROLE service_role;
SELECT count(*) AS empty_probe_count
FROM public.get_meals_around_workout(
  '00000000-0000-0000-0000-000000000000'::UUID,
  4
);
RESET ROLE;

DO $verify_backup_rows_preserved$
BEGIN
  IF (SELECT count(*) FROM public.whoop_recovery_backup)
      <> current_setting('legacy_security_verify.recovery_count')::BIGINT
    OR (SELECT count(*) FROM public.whoop_sleep_backup)
      <> current_setting('legacy_security_verify.sleep_count')::BIGINT
    OR (SELECT count(*) FROM public.whoop_workouts_backup)
      <> current_setting('legacy_security_verify.workout_count')::BIGINT THEN
    RAISE EXCEPTION 'Backup-table row counts changed during verification';
  END IF;
END
$verify_backup_rows_preserved$;

ROLLBACK;
