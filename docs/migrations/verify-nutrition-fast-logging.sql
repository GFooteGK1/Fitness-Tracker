-- Post-apply verification for 20260728143952_nutrition_fast_logging.sql.
-- Run the migration twice first. This script requires two auth users and rolls
-- back every food, meal, and request-id fixture it creates.

BEGIN;

DO $prerequisites$
DECLARE
  available_users INTEGER;
BEGIN
  SELECT COUNT(*) INTO available_users
  FROM (SELECT id FROM auth.users ORDER BY id LIMIT 2) AS users;
  IF available_users < 2 THEN
    RAISE EXCEPTION 'Nutrition fast-log verification requires two auth users; found %', available_users;
  END IF;
  IF to_regclass('public.meals') IS NULL OR to_regclass('public.food_catalog_entries') IS NULL THEN
    RAISE EXCEPTION 'Nutrition fast-log tables are missing';
  END IF;
END
$prerequisites$;

SELECT set_config('fitness_nutrition_fast_log.user_1', (SELECT id::TEXT FROM auth.users ORDER BY id LIMIT 1), TRUE);
SELECT set_config('fitness_nutrition_fast_log.user_2', (SELECT id::TEXT FROM auth.users ORDER BY id OFFSET 1 LIMIT 1), TRUE);
SELECT set_config('fitness_nutrition_fast_log.source_meal', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('fitness_nutrition_fast_log.quick_meal', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('fitness_nutrition_fast_log.catalog_1', gen_random_uuid()::TEXT, TRUE);
SELECT set_config('fitness_nutrition_fast_log.request_1', gen_random_uuid()::TEXT, TRUE);

DO $structure$
DECLARE
  rls_state RECORD;
BEGIN
  SELECT relrowsecurity, relforcerowsecurity INTO rls_state
  FROM pg_class WHERE oid = 'public.food_catalog_entries'::regclass;
  IF NOT rls_state.relrowsecurity OR NOT rls_state.relforcerowsecurity THEN
    RAISE EXCEPTION 'food_catalog_entries must have enabled and forced RLS';
  END IF;

  IF (
    SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meals'
      AND column_name IN ('entry_method', 'source_meal_id', 'log_request_id')
  ) <> 3 THEN
    RAISE EXCEPTION 'meals fast-log provenance columns are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meals'::regclass
      AND conname = 'meals_source_meal_owner_fk'
  ) THEN
    RAISE EXCEPTION 'tenant-consistent source meal foreign key is missing';
  END IF;

  IF to_regclass('public.idx_meals_log_request_id') IS NULL
    OR to_regclass('public.idx_food_catalog_entries_recent') IS NULL
    OR to_regclass('public.idx_food_catalog_entries_barcode') IS NULL THEN
    RAISE EXCEPTION 'nutrition fast-log indexes are incomplete';
  END IF;

  IF (
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'food_catalog_entries'
      AND 'authenticated'::name = ANY (roles)
  ) <> 4 THEN
    RAISE EXCEPTION 'food_catalog_entries must have four authenticated owner policies';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.food_catalog_entries', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.food_catalog_entries', 'INSERT')
    OR NOT has_table_privilege('authenticated', 'public.food_catalog_entries', 'UPDATE')
    OR NOT has_table_privilege('authenticated', 'public.food_catalog_entries', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated food_catalog_entries grants are incomplete';
  END IF;

  IF has_table_privilege('anon', 'public.food_catalog_entries', 'SELECT')
    OR has_table_privilege('anon', 'public.food_catalog_entries', 'INSERT')
    OR has_table_privilege('anon', 'public.food_catalog_entries', 'UPDATE')
    OR has_table_privilege('anon', 'public.food_catalog_entries', 'DELETE') THEN
    RAISE EXCEPTION 'anon must not have food_catalog_entries privileges';
  END IF;
END
$structure$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('fitness_nutrition_fast_log.user_1'), TRUE);
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('fitness_nutrition_fast_log.user_1'), 'role', 'authenticated')::TEXT,
  TRUE
);

INSERT INTO public.food_catalog_entries (
  id, user_id, name, barcode, barcode_lookup_key, source, source_key,
  serving_amount, serving_unit, serving_label, nutrition_basis,
  protein, carbs, fat, calories, source_nutrition
) VALUES (
  current_setting('fitness_nutrition_fast_log.catalog_1')::UUID,
  current_setting('fitness_nutrition_fast_log.user_1')::UUID,
  'Verification food', '034000470693', '0034000470693', 'manual_label', '0034000470693',
  1, 'serving', '1 serving', 'per_serving',
  10, 20, 5, 165, '{"protein":10,"carbs":20,"fat":5,"calories":165}'::JSONB
);

INSERT INTO public.meals (
  id, user_id, meal_timestamp, items, total_protein, total_carbs, total_fat,
  total_calories, needs_review, manual_override, entry_method
) VALUES (
  current_setting('fitness_nutrition_fast_log.source_meal')::UUID,
  current_setting('fitness_nutrition_fast_log.user_1')::UUID,
  NOW(), '[{"food":"Verification food","portion":"1 serving","protein":10,"carbs":20,"fat":5,"calories":165}]'::JSONB,
  10, 20, 5, 165, false, true, 'manual_label'
);

INSERT INTO public.meals (
  id, user_id, meal_timestamp, items, total_protein, total_carbs, total_fat,
  total_calories, needs_review, manual_override, entry_method, source_meal_id, log_request_id
) VALUES (
  current_setting('fitness_nutrition_fast_log.quick_meal')::UUID,
  current_setting('fitness_nutrition_fast_log.user_1')::UUID,
  NOW(), '[{"food":"Verification food","portion":"1 serving","protein":10,"carbs":20,"fat":5,"calories":165}]'::JSONB,
  10, 20, 5, 165, false, true, 'quick_log',
  current_setting('fitness_nutrition_fast_log.source_meal')::UUID,
  current_setting('fitness_nutrition_fast_log.request_1')::UUID
);

DO $user_1$
BEGIN
  IF (SELECT COUNT(*) FROM public.food_catalog_entries WHERE name = 'Verification food') <> 1 THEN
    RAISE EXCEPTION 'user 1 cannot read their catalog entry';
  END IF;

  BEGIN
    INSERT INTO public.food_catalog_entries (
      user_id, name, source, source_key, serving_amount, serving_unit, serving_label,
      nutrition_basis, protein, carbs, fat, calories
    ) VALUES (
      current_setting('fitness_nutrition_fast_log.user_2')::UUID,
      'Blocked cross user', 'manual_label', 'blocked', 1, 'serving', '1 serving',
      'per_serving', 0, 0, 0, 0
    );
    RAISE EXCEPTION 'user 1 inserted a catalog entry for user 2';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.meals (
      user_id, meal_timestamp, items, total_protein, total_carbs, total_fat,
      total_calories, entry_method, source_meal_id, log_request_id
    ) VALUES (
      current_setting('fitness_nutrition_fast_log.user_1')::UUID,
      NOW(), '[]'::JSONB, 0, 0, 0, 0, 'quick_log',
      current_setting('fitness_nutrition_fast_log.source_meal')::UUID,
      current_setting('fitness_nutrition_fast_log.request_1')::UUID
    );
    RAISE EXCEPTION 'duplicate fast-log request id was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END
$user_1$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('fitness_nutrition_fast_log.user_2'), TRUE);
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('fitness_nutrition_fast_log.user_2'), 'role', 'authenticated')::TEXT,
  TRUE
);

DO $user_2$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.food_catalog_entries
    WHERE id = current_setting('fitness_nutrition_fast_log.catalog_1')::UUID
  ) THEN
    RAISE EXCEPTION 'user 2 can read user 1 food catalog entries';
  END IF;

  BEGIN
    INSERT INTO public.meals (
      user_id, meal_timestamp, items, total_protein, total_carbs, total_fat,
      total_calories, entry_method, source_meal_id, log_request_id
    ) VALUES (
      current_setting('fitness_nutrition_fast_log.user_2')::UUID,
      NOW(), '[]'::JSONB, 0, 0, 0, 0, 'quick_log',
      current_setting('fitness_nutrition_fast_log.source_meal')::UUID,
      gen_random_uuid()
    );
    RAISE EXCEPTION 'user 2 referenced user 1 source meal';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END
$user_2$;

RESET ROLE;
ROLLBACK;

SELECT 'nutrition fast-log verification passed; fixtures rolled back' AS verification_result;
