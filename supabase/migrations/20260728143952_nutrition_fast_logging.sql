BEGIN;

-- Common meals remain a deterministic projection of the canonical meals log.
-- These columns make each copy idempotent and preserve where the snapshot came
-- from without coupling it to a mutable template row.
ALTER TABLE public.meals
  ADD COLUMN IF NOT EXISTS entry_method TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS source_meal_id UUID,
  ADD COLUMN IF NOT EXISTS log_request_id UUID;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meals'::regclass
      AND conname = 'meals_entry_method_check'
  ) THEN
    ALTER TABLE public.meals
      ADD CONSTRAINT meals_entry_method_check
      CHECK (entry_method IN (
        'other', 'photo', 'text', 'agent', 'quick_log', 'barcode', 'manual_label'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meals'::regclass
      AND conname = 'meals_user_id_id_unique'
  ) THEN
    ALTER TABLE public.meals
      ADD CONSTRAINT meals_user_id_id_unique UNIQUE (user_id, id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meals'::regclass
      AND conname = 'meals_source_meal_owner_fk'
  ) THEN
    ALTER TABLE public.meals
      ADD CONSTRAINT meals_source_meal_owner_fk
      FOREIGN KEY (user_id, source_meal_id)
      REFERENCES public.meals(user_id, id)
      ON DELETE SET NULL (source_meal_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.meals'::regclass
      AND conname = 'meals_quick_log_source_check'
  ) THEN
    ALTER TABLE public.meals
      ADD CONSTRAINT meals_quick_log_source_check CHECK (
        source_meal_id IS NULL OR entry_method = 'quick_log'
      );
  END IF;
END
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meals_log_request_id
  ON public.meals(user_id, log_request_id)
  WHERE log_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meals_source_meal
  ON public.meals(user_id, source_meal_id)
  WHERE source_meal_id IS NOT NULL;

-- Structured, reviewed label facts are reusable application data. The source
-- snapshot is intentionally bounded and contains normalized metadata only;
-- label and meal images are not retained by this migration.
CREATE TABLE IF NOT EXISTS public.food_catalog_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL
    CONSTRAINT food_catalog_entries_name_present
    CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  brand TEXT
    CONSTRAINT food_catalog_entries_brand_length
    CHECK (brand IS NULL OR length(btrim(brand)) BETWEEN 1 AND 160),
  barcode TEXT
    CONSTRAINT food_catalog_entries_barcode_check
    CHECK (barcode IS NULL OR barcode ~ '^([0-9]{7,8}|[0-9]{12,14})$'),
  barcode_lookup_key TEXT
    CONSTRAINT food_catalog_entries_lookup_key_check
    CHECK (
      (barcode IS NULL AND barcode_lookup_key IS NULL)
      OR (
        barcode IS NOT NULL
        AND barcode_lookup_key IS NOT NULL
        AND barcode_lookup_key ~ '^([0-9]{8}|[0-9]{13,14})$'
      )
    ),
  source TEXT NOT NULL
    CONSTRAINT food_catalog_entries_source_check
    CHECK (source IN ('open_food_facts', 'manual_label')),
  source_key TEXT NOT NULL
    CONSTRAINT food_catalog_entries_source_key_present
    CHECK (length(btrim(source_key)) BETWEEN 1 AND 160),
  source_ref TEXT
    CONSTRAINT food_catalog_entries_source_ref_length
    CHECK (source_ref IS NULL OR length(btrim(source_ref)) BETWEEN 1 AND 200),
  serving_amount NUMERIC(10, 3) NOT NULL
    CONSTRAINT food_catalog_entries_serving_amount_positive
    CHECK (serving_amount > 0 AND serving_amount <= 100000),
  serving_unit TEXT NOT NULL
    CONSTRAINT food_catalog_entries_serving_unit_present
    CHECK (length(btrim(serving_unit)) BETWEEN 1 AND 24),
  serving_label TEXT NOT NULL
    CONSTRAINT food_catalog_entries_serving_label_present
    CHECK (length(btrim(serving_label)) BETWEEN 1 AND 120),
  nutrition_basis TEXT NOT NULL
    CONSTRAINT food_catalog_entries_nutrition_basis_check
    CHECK (nutrition_basis IN ('per_serving', 'per_100g')),
  protein NUMERIC(8, 2) NOT NULL
    CONSTRAINT food_catalog_entries_protein_range CHECK (protein BETWEEN 0 AND 500),
  carbs NUMERIC(8, 2) NOT NULL
    CONSTRAINT food_catalog_entries_carbs_range CHECK (carbs BETWEEN 0 AND 1000),
  fat NUMERIC(8, 2) NOT NULL
    CONSTRAINT food_catalog_entries_fat_range CHECK (fat BETWEEN 0 AND 300),
  calories NUMERIC(9, 2) NOT NULL
    CONSTRAINT food_catalog_entries_calories_range CHECK (calories BETWEEN 0 AND 5000),
  source_nutrition JSONB NOT NULL DEFAULT '{}'::JSONB
    CONSTRAINT food_catalog_entries_source_nutrition_object
    CHECK (jsonb_typeof(source_nutrition) = 'object'),
  corrections JSONB NOT NULL DEFAULT '{}'::JSONB
    CONSTRAINT food_catalog_entries_corrections_object
    CHECK (jsonb_typeof(corrections) = 'object'),
  source_payload JSONB NOT NULL DEFAULT '{}'::JSONB
    CONSTRAINT food_catalog_entries_source_payload_object
    CHECK (
      jsonb_typeof(source_payload) = 'object'
      AND pg_column_size(source_payload) <= 32768
    ),
  source_fetched_at TIMESTAMPTZ,
  user_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id),
  UNIQUE (user_id, source, source_key)
);

CREATE INDEX IF NOT EXISTS idx_food_catalog_entries_recent
  ON public.food_catalog_entries(user_id, last_used_at DESC);

CREATE INDEX IF NOT EXISTS idx_food_catalog_entries_barcode
  ON public.food_catalog_entries(user_id, barcode_lookup_key)
  WHERE barcode_lookup_key IS NOT NULL;

ALTER TABLE public.food_catalog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_catalog_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS food_catalog_entries_select_own ON public.food_catalog_entries;
CREATE POLICY food_catalog_entries_select_own
  ON public.food_catalog_entries FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS food_catalog_entries_insert_own ON public.food_catalog_entries;
CREATE POLICY food_catalog_entries_insert_own
  ON public.food_catalog_entries FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS food_catalog_entries_update_own ON public.food_catalog_entries;
CREATE POLICY food_catalog_entries_update_own
  ON public.food_catalog_entries FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS food_catalog_entries_delete_own ON public.food_catalog_entries;
CREATE POLICY food_catalog_entries_delete_own
  ON public.food_catalog_entries FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.food_catalog_entries FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.food_catalog_entries TO authenticated;
GRANT ALL ON TABLE public.food_catalog_entries TO service_role;

CREATE OR REPLACE FUNCTION public.touch_food_catalog_entry_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.touch_food_catalog_entry_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS touch_food_catalog_entry_updated_at ON public.food_catalog_entries;
CREATE TRIGGER touch_food_catalog_entry_updated_at
  BEFORE UPDATE ON public.food_catalog_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_food_catalog_entry_updated_at();

COMMENT ON TABLE public.food_catalog_entries IS
  'Private reviewed nutrition-label facts and source provenance; no label images are retained';
COMMENT ON COLUMN public.food_catalog_entries.corrections IS
  'User-reviewed values that differ from the normalized source snapshot';
COMMENT ON COLUMN public.meals.log_request_id IS
  'Client request UUID used to make fast meal logging idempotent per user';

COMMIT;
